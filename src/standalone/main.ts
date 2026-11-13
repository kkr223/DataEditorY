import { mount } from 'svelte';
import StandaloneApp from './StandaloneApp.svelte';

mount(StandaloneApp, { target: document.getElementById('app')! });
