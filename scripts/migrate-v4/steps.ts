import type { MigrationStep } from './index';

/**
 * Steps run in order, each inside its own transaction.
 * P1–P5 of docs/migration-plan.md add their steps here.
 */
export const steps: MigrationStep[] = [];
