import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en', 'fr'],

  // Used when no locale matches
  defaultLocale: 'en',

  // English is served without prefix (`/`), other locales are prefixed (`/fr`)
  localePrefix: 'as-needed',

  // Don't redirect based on Accept-Language: `/` always serves English
  localeDetection: false,
})
