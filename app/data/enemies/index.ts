import { SAMPLE_DUMMY, SAMPLE_ELITE, SAMPLE_BOSS } from './sampleEnemies';
import { FLAMESPAWN } from './flamespawn';
import { FROSTSPAWN } from './frostspawn';
import { VOIDRANGER_TRAMPLER } from './voidranger-trampler';
import { VOIDRANGER_REAVER } from './voidranger-reaver';
import { EnemyData } from '../../types';

export * from './dummy';
export * from './levelStats';
export * from './sampleEnemies';
export * from './flamespawn';
export * from './frostspawn';
export * from './voidranger-trampler';
export * from './voidranger-reaver';

export const ALL_ENEMIES: EnemyData[] = [
    SAMPLE_DUMMY,
    SAMPLE_ELITE,
    SAMPLE_BOSS,
    FLAMESPAWN,
    FROSTSPAWN,
    VOIDRANGER_TRAMPLER,
    VOIDRANGER_REAVER,
];
