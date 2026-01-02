import { SAMPLE_DUMMY, SAMPLE_ELITE, SAMPLE_BOSS } from './sampleEnemies';
import { FLAMESPAWN } from './flamespawn';
import { EnemyData } from '../../types';

export * from './dummy';
export * from './levelStats';
export * from './sampleEnemies';
export * from './flamespawn';

export const ALL_ENEMIES: EnemyData[] = [
    SAMPLE_DUMMY,
    SAMPLE_ELITE,
    SAMPLE_BOSS,
    FLAMESPAWN,
];
