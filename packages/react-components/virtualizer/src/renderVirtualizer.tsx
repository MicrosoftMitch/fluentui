import * as React from 'react';
import { getSlots } from '@fluentui/react-utilities';
import { VirtualizerSlots, VirtualizerState } from './Virtualizer.types';

export const renderVirtualizer_unstable = (state: VirtualizerState) => {
  const { slots, slotProps } = getSlots<VirtualizerSlots>(state);
  const { isReversed, isHorizontal, beforeBufferHeight, afterBufferHeight, bufferSize } = state;

  const beforeHeightPx = beforeBufferHeight + 'px';
  const afterHeightPx = afterBufferHeight + 'px';
  const beforeBufferHeightPx = beforeBufferHeight + bufferSize + 'px';
  const afterBufferHeightPx = afterBufferHeight + bufferSize + 'px';
  let topPos = 0;
  let bottomPos = bufferSize;

  if (isReversed) {
    [topPos, bottomPos] = [bottomPos, topPos];
  }

  const topPosPx = topPos + 'px';
  const bottomPosPx = bottomPos + 'px';

  const beforeBuffer = {
    // Column
    ...(!isReversed && !isHorizontal && { top: topPosPx }),
    // Column-Reverse
    ...(isReversed && !isHorizontal && { bottom: topPosPx }),
    // Row-Reverse
    ...(isReversed && isHorizontal && { left: `-${topPosPx}` }),
    // Row
    ...(!isReversed && isHorizontal && { right: topPosPx }),
  };

  const afterBuffer = {
    // Column-Reverse
    ...(isReversed && !isHorizontal && { top: bottomPosPx }),
    // Column
    ...(!isReversed && !isHorizontal && { bottom: bottomPosPx }),
    // Row
    ...(!isReversed && isHorizontal && { left: `-${bottomPosPx}` }),
    // Row-Reverse
    ...(isReversed && isHorizontal && { right: bottomPosPx }),
  };

  const beforeStyle = {
    height: isHorizontal ? '100%' : beforeBufferHeightPx,
    width: isHorizontal ? beforeBufferHeightPx : '100%',
    ...beforeBuffer,
  };

  const beforeContainerStyle = {
    height: isHorizontal ? 'auto' : beforeHeightPx,
    width: isHorizontal ? beforeHeightPx : 'auto',
  };

  const afterStyle = {
    height: isHorizontal ? '100%' : afterBufferHeightPx,
    width: isHorizontal ? afterBufferHeightPx : '100%',
    ...afterBuffer,
  };

  const afterContainerStyle = {
    height: isHorizontal ? 'auto' : afterHeightPx,
    width: isHorizontal ? afterHeightPx : 'auto',
  };

  return (
    <React.Fragment>
      {/* The 'before' bookend to hold items in place and detect scroll previous */}
      {slots.beforeContainer && slots.before && (
        <slots.beforeContainer style={beforeContainerStyle} {...slotProps.beforeContainer}>
          <slots.before style={beforeStyle} {...slotProps.before} />
        </slots.beforeContainer>
      )}
      {/* The reduced list of non-virtualized children to be rendered */}
      {state.virtualizedChildren}
      {/* The 'after' bookend to hold items in place and detect scroll next */}
      {slots.afterContainer && slots.after && (
        <slots.afterContainer style={afterContainerStyle} {...slotProps.afterContainer}>
          <slots.after style={afterStyle} {...slotProps.after} />
        </slots.afterContainer>
      )}
    </React.Fragment>
  );
};
