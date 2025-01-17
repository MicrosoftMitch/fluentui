export const sampleStyles = `
import { makeStyles, mergeClasses } from '@griffel/react';
import { tokens } from '@fluentui/react-theme';
import { createCustomFocusIndicatorStyle } from '@fluentui/react-tabster';

const useStyles = makeStyles({
  focusIndicator: createCustomFocusIndicatorStyle({
    textDecorationColor: tokens.colorStrokeFocus2,
  }),
  root: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground1,
    ':hover': {
      color: tokens.colorNeutralForegroundHover,
    }
  },
  large: {
    fontSize: tokens.fontSizeBase600,
  },
  disabled: {
    color: tokens.colorNeutralForegroundDisabled,
  }
});

export const Component = () => {
  const styles = useStyles();

  const state = {root:{}}

  state.root.className = mergeClasses(
    styles.root,
    styles.focusIndicator,
    size === 'large' && styles.large,
    disabled && styles.disabled
  );

  return <div className={state.root.className} />;
};
`;
