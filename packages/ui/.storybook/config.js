import { configure } from '@storybook/react';

configure(require.context('../lib', true, /\.story\.js$/), module);
