import type { MigrationStep } from './index';
import { p1Characters } from './steps/p1-characters';

/**
 * Steps run in order, each inside its own transaction.
 * P1–P5 of docs/migration-plan.md add their steps here.
 */
export const steps: MigrationStep[] = [p1Characters];
