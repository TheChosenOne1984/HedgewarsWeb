import { mount } from 'svelte';
import App from './App.svelte';
import { app as state } from './lib/app.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// for debugging in the browser console and for end-to-end tests
(window as unknown as { hedgewars: typeof state }).hedgewars = state;

export default app;
