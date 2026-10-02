/**
 * The app's entry to the data layer. Route handlers and server components import from
 * '@/server'; `server-only` makes a client-component import fail the build.
 * Scripts import the repos directly (server-only would reject them outside Next).
 */
import 'server-only';

export * from './repos/notes';
export * from './repos/grammar';
export * from './repos/passages';
export * from './repos/characters';
export * from './repos/vocab';
export * from './services/lessonImport';
export * from './services/mandarinBean';
