import { addMessages, init, getLocaleFromNavigator } from 'svelte-i18n';
import { browser } from '$app/environment';

import en from './locales/en.json';
import zh from './locales/zh.json';

addMessages('en', en);
addMessages('zh', zh);

export function setupI18n() {
  let defaultLocale = 'en';
  if (browser) {
    defaultLocale = getLocaleFromNavigator() || 'en';
  }
  
  // Prefer 'zh' for zh-CN, zh-TW, etc.
  const initialLocale = defaultLocale.startsWith('zh') ? 'zh' : 'en';

  init({
    fallbackLocale: 'en',
    initialLocale,
  });
}
