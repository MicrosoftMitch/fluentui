import { useIntersectionObserver } from './useIntersectionObserver';
import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import * as React from 'react';

import type { VirtualizerProps, VirtualizerState } from './Virtualizer.types';
import { resolveShorthand } from '@fluentui/react-utilities';

export function useVirtualizer_unstable(props: React.PropsWithChildren<VirtualizerProps>): VirtualizerState {
  const {
    itemSize,
    virtualizerLength,
    children,
    sizeOfChild,
    bufferItems = Math.round(virtualizerLength / 4.0),
    bufferSize = Math.floor(bufferItems / 2.0) * itemSize,
    scrollViewRef,
    isReversed = false,
    isHorizontal = false,
    onUpdateIndex,
    onCalculateIndex,
  } = props;

  // Safe access array version of children
  const childArray = React.Children.toArray(children);

  // Tracks the initial item to start virtualizer at, -1 implies first render cycle
  const [virtualizerStartIndex, setVirtualizerStartIndex] = useState<number>(-1);

  // Store ref to before padding element
  const beforeElementRef = useRef<Element | null>(null);

  // Store ref to before padding element
  const afterElementRef = useRef<Element | null>(null);

  // We need to store an array to track dynamic sizes, we can use this to incrementally update changes
  const childSizes = useRef<number[]>(new Array<number>(sizeOfChild ? childArray.length : 0));

  /* We keep track of the progressive sizing/placement down the list,
  this helps us skip re-calculations unless children/size changes */
  const childProgressiveSizes = useRef<number[]>(new Array<number>(sizeOfChild ? childArray.length : 0));

  const populateSizeArrays = () => {
    if (!sizeOfChild) {
      // Static sizes, never mind!
      return;
    }

    if (childArray.length > childSizes.current.length) {
      childSizes.current = new Array<number>(childArray.length);
    }

    if (childArray.length > childProgressiveSizes.current.length) {
      childProgressiveSizes.current = new Array<number>(childArray.length);
    }

    childArray.forEach((child, index) => {
      childSizes.current[index] = sizeOfChild(child, index);

      if (index === 0) {
        childProgressiveSizes.current[index] = childSizes.current[index];
      } else {
        childProgressiveSizes.current[index] = childProgressiveSizes.current[index - 1] + childSizes.current[index];
      }
    });
  };

  if (
    sizeOfChild &&
    (childArray.length !== childSizes.current.length || childArray.length !== childProgressiveSizes.current.length)
  ) {
    // Dynamically sized items.
    // Child length has changed, do a full recalculation.
    // Otherwise, incremental updater will handle.
    populateSizeArrays();
  }

  // Observe intersections of virtualized components
  const [setIOList, _setIOInit, _observer] = useIntersectionObserver(
    (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
      /* Sanity check - do we even need virtualization? */
      if (virtualizerLength > childArray.length) {
        if (virtualizerStartIndex !== 0) {
          onUpdateIndex?.(0, virtualizerStartIndex);
          setVirtualizerStartIndex(0);
        }
        // No-op
        return;
      }

      /* IO initiates this function when needed (bookend entering view) */
      let measurementPos = 0;
      let bufferCount = bufferItems;

      // Grab latest entry that is intersecting
      const latestEntry =
        entries.length === 1
          ? entries[0]
          : entries
              .sort((entry1, entry2) => entry2.time - entry1.time)
              .find(entry => {
                return entry.intersectionRatio > 0;
              });

      if (!latestEntry) {
        // If we don't find an intersecting area, ignore for now.
        return;
      }

      if (latestEntry.target === afterElementRef.current) {
        // We need to inverse the buffer count
        bufferCount = virtualizerLength - bufferItems;
        measurementPos = isReversed ? calculateAfter() : calculateTotalSize() - calculateAfter();
        if (!isHorizontal) {
          if (isReversed) {
            // Scrolling 'up' and hit the after element below
            measurementPos -= Math.abs(latestEntry.boundingClientRect.bottom);
          } else if (latestEntry.boundingClientRect.top < 0) {
            // Scrolling 'down' and hit the after element above top: 0
            measurementPos -= latestEntry.boundingClientRect.top;
          }
        } else {
          if (isReversed) {
            // Scrolling 'left' and hit the after element
            measurementPos -= Math.abs(latestEntry.boundingClientRect.right);
          } else if (latestEntry.boundingClientRect.left < 0) {
            // Scrolling 'right' and hit the after element
            measurementPos -= latestEntry.boundingClientRect.left;
          }
        }
      } else if (latestEntry.target === beforeElementRef.current) {
        measurementPos = isReversed ? calculateTotalSize() - calculateBefore() : calculateBefore();
        if (!isHorizontal) {
          if (!isReversed) {
            measurementPos -= Math.abs(latestEntry.boundingClientRect.bottom);
          } else if (latestEntry.boundingClientRect.top < 0) {
            // Scrolling 'down' in reverse order and hit the before element above top: 0
            measurementPos -= latestEntry.boundingClientRect.top;
          }
        } else {
          if (!isReversed) {
            measurementPos -= Math.abs(latestEntry.boundingClientRect.right);
          } else if (latestEntry.boundingClientRect.left < 0) {
            // Scrolling 'left' and hit before element
            measurementPos -= latestEntry.boundingClientRect.left;
          }
        }
      }

      if (isReversed) {
        // We're reversed, up is down, left is right, invert the scroll measure.
        measurementPos = Math.max(calculateTotalSize() - Math.abs(measurementPos), 0);
      }

      // For now lets use hardcoded size to assess current element to paginate on
      const startIndex = getIndexFromScrollPosition(measurementPos);
      let bufferedIndex = Math.max(startIndex - bufferCount, 0);

      if (onCalculateIndex) {
        // User has chance to intervene/customize prior to render
        // They may want to normalize this value.
        bufferedIndex = onCalculateIndex(bufferedIndex);
      }

      // Safety limits
      const maxIndex = Math.max(childArray.length - virtualizerLength, 0);
      const newStartIndex = Math.min(Math.max(bufferedIndex, 0), maxIndex);

      if (virtualizerStartIndex !== newStartIndex) {
        // Set new index, trigger render!
        onUpdateIndex?.(newStartIndex, virtualizerStartIndex);
        setVirtualizerStartIndex(newStartIndex);
        /*
          We need to ensure our dynamic size array
          calculations are always up to date prior to render.
        */
        updateCurrentItemSizes();
      }
    },
    {
      root: scrollViewRef ? scrollViewRef?.current : null,
      rootMargin: '0px',
      threshold: 0,
    },
  );

  const findIndexRecursive = (scrollPos: number, lowIndex: number, highIndex: number): number => {
    if (lowIndex > highIndex) {
      // We shouldn't get here - but no-op the index if we do.
      return virtualizerStartIndex;
    }
    const midpoint = Math.floor((lowIndex + highIndex) / 2);
    const iBefore = Math.max(midpoint - 1, 0);
    const iAfter = Math.min(midpoint + 1, childProgressiveSizes.current.length - 1);
    const indexValue = childProgressiveSizes.current[midpoint];
    const afterIndexValue = childProgressiveSizes.current[iAfter];
    const beforeIndexValue = childProgressiveSizes.current[iBefore];
    if (indexValue === scrollPos || (scrollPos <= afterIndexValue && scrollPos >= beforeIndexValue)) {
      /* We've found our index - if we are exactly matching before/after index that's ok,
      better to reduce checks if it's right on the boundary. */
      return midpoint;
    }

    if (indexValue > scrollPos) {
      return findIndexRecursive(scrollPos, lowIndex, midpoint - 1);
    } else {
      return findIndexRecursive(scrollPos, midpoint + 1, highIndex);
    }
  };

  const getIndexFromSizeArray = (scrollPos: number): number => {
    /* TODO: We should use some kind of logN calc, cut array in half and measure etc.
     * Just simple array iteration for now to ensure rest of design works in tandem.
     */
    if (
      scrollPos === 0 ||
      childProgressiveSizes.current.length === 0 ||
      scrollPos <= childProgressiveSizes.current[0]
    ) {
      // Check start
      return 0;
    }

    if (scrollPos >= childProgressiveSizes.current[childProgressiveSizes.current.length - 1]) {
      // Check end
      return childProgressiveSizes.current.length - 1;
    }

    return findIndexRecursive(scrollPos, 0, childProgressiveSizes.current.length - 1);
  };

  const getIndexFromScrollPosition = (scrollPos: number) => {
    if (!sizeOfChild) {
      return Math.round(scrollPos / itemSize);
    }

    return getIndexFromSizeArray(scrollPos);
  };

  const calculateTotalSize = () => {
    if (!sizeOfChild) {
      return itemSize * childArray.length;
    }

    // Time for custom size calcs
    return childProgressiveSizes.current[childArray.length - 1];
  };

  const calculateBefore = () => {
    if (!sizeOfChild) {
      // The missing items from before virtualization starts height
      return virtualizerStartIndex * itemSize;
    }

    if (virtualizerStartIndex === 0) {
      return 0;
    }

    // Time for custom size calcs
    return childProgressiveSizes.current[virtualizerStartIndex - 1];
  };

  const calculateAfter = () => {
    if (childArray.length === 0) {
      return 0;
    }
    const lastItemIndex = Math.min(virtualizerStartIndex + virtualizerLength, childArray.length - 1);
    if (!sizeOfChild) {
      // The missing items from after virtualization ends height
      const remainingItems = childArray.length - lastItemIndex - 1;

      return remainingItems * itemSize;
    }

    // Time for custom size calcs
    return childProgressiveSizes.current[childArray.length - 1] - childProgressiveSizes.current[lastItemIndex];
  };

  const generateRows = (): ReactNode[] => {
    if (childArray.length === 0) {
      /* Nothing to virtualize */

      return [];
    }

    const actualIndex = Math.max(virtualizerStartIndex, 0);
    const end = Math.min(actualIndex + virtualizerLength, childArray.length);

    return childArray.slice(actualIndex, end);
  };

  const setBeforeRef = (element: HTMLDivElement) => {
    if (!element || beforeElementRef.current === element) {
      return;
    }
    beforeElementRef.current = element;
    const newList = [];

    newList.push(beforeElementRef.current);

    if (afterElementRef.current) {
      newList.push(afterElementRef.current);
    }

    // Ensure we update array if before element changed
    setIOList(newList);
  };

  const setAfterRef = (element: HTMLDivElement) => {
    if (!element || afterElementRef.current === element) {
      return;
    }
    afterElementRef.current = element;
    const newList = [];

    if (beforeElementRef.current) {
      newList.push(beforeElementRef.current);
    }

    newList.push(afterElementRef.current);

    // Ensure we update array if after element changed
    setIOList(newList);
  };

  const updateCurrentItemSizes = () => {
    if (!sizeOfChild) {
      // Static sizes, not required.
      return;
    }
    // We should always call our size function on index change (only for the items that will be rendered)
    // This ensures we request the latest data for incoming items in case sizing has changed.
    const endIndex = Math.max(virtualizerStartIndex + virtualizerLength, childArray.length);

    let didUpdate = false;
    for (let i = Math.max(virtualizerStartIndex, 0); i < endIndex; i++) {
      const newSize = sizeOfChild(childArray[i], i);
      if (newSize !== childSizes.current[i]) {
        childSizes.current[i] = sizeOfChild(childArray[i], i);
        didUpdate = true;
      }
    }

    if (didUpdate) {
      // Update our progressive size array
      for (let i = virtualizerStartIndex; i < childArray.length; i++) {
        const prevSize = i > 0 ? childProgressiveSizes.current[i - 1] : 0;
        childProgressiveSizes.current[i] = prevSize + childSizes.current[i];
      }
    }
  };

  // Initialize the size array before first render.
  const hasInitialized = useRef<boolean>(false);
  const initializeSizeArray = () => {
    if (hasInitialized.current === false) {
      hasInitialized.current = true;
      populateSizeArrays();
    }
  };

  // Ensure we have run through and updated the whole size list array at least once.
  initializeSizeArray();

  const isFullyInitialized = hasInitialized.current && virtualizerStartIndex >= 0;

  return {
    components: {
      before: 'div',
      after: 'div',
      beforeContainer: 'div',
      afterContainer: 'div',
    },
    virtualizedChildren: generateRows(),
    before: resolveShorthand(props.before ?? { as: 'div' }, {
      defaultProps: {
        ref: setBeforeRef,
        role: 'none',
      },
    }),
    after: resolveShorthand(props.after ?? { as: 'div' }, {
      defaultProps: {
        ref: setAfterRef,
        role: 'none',
      },
    }),
    beforeContainer: resolveShorthand(props.beforeContainer ?? { as: 'div' }, {
      defaultProps: {
        role: 'none',
      },
    }),
    afterContainer: resolveShorthand(props.afterContainer ?? { as: 'div' }, {
      defaultProps: {
        role: 'none',
      },
    }),
    beforeBufferHeight: isFullyInitialized ? calculateBefore() : 0,
    afterBufferHeight: isFullyInitialized ? calculateAfter() : 0,
    totalVirtualizerHeight: isFullyInitialized ? calculateTotalSize() : virtualizerLength * itemSize,
    virtualizerStartIndex: isFullyInitialized ? virtualizerStartIndex : 0,
    isHorizontal,
    bufferSize,
    isReversed,
  };
}
