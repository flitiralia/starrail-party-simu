import { GameState, Unit } from './types';

export type TargetType = 'single_enemy' | 'all_enemies' | 'ally' | 'all_allies' | 'self' | 'blast' | 'bounce' | 'random_enemy';

export interface TargetCriteria {
    type: TargetType;
    filter?: (unit: Unit, state: GameState) => boolean;
    sort?: (a: Unit, b: Unit) => number;
    count?: number; // For random or specific count selection
}

export class TargetSelector {
    static select(source: Unit, state: GameState, criteria: TargetCriteria): Unit[] {
        let candidates: Unit[] = [];

        // 1. Initial Candidate Selection
        // 注意: 'all_enemies'（複数形）と'single_enemy'（単数形）の両方を正しく判定する
        const isEnemyTarget = criteria.type === 'single_enemy' ||
            criteria.type === 'all_enemies' ||
            criteria.type === 'random_enemy' ||
            criteria.type === 'blast' ||
            criteria.type === 'bounce';
        const isAllyTarget = criteria.type === 'ally' || criteria.type === 'all_allies';

        if (criteria.type === 'self') {
            return [source];
        } else if (isEnemyTarget) {
            candidates = state.registry.getAliveEnemies();
        } else if (isAllyTarget) {
            candidates = state.registry.getAliveAllies();
        }

        // 2. Filter
        if (criteria.filter) {
            candidates = candidates.filter(u => criteria.filter!(u, state));
        }

        // 3. Sort
        if (criteria.sort) {
            candidates.sort(criteria.sort);
        }

        // 4. Selection based on Type
        if (criteria.type === 'single_enemy' || criteria.type === 'ally') {
            // Default to first candidate (which might be sorted)
            return candidates.length > 0 ? [candidates[0]] : [];
        } else if (criteria.type === 'all_enemies' || criteria.type === 'all_allies') {
            return candidates;
        } else if (criteria.type === 'random_enemy') {
            // Simple random selection
            if (candidates.length === 0) return [];
            const count = criteria.count || 1;
            const selected: Unit[] = [];
            const pool = [...candidates];
            for (let i = 0; i < count; i++) {
                if (pool.length === 0) break;
                const idx = Math.floor(Math.random() * pool.length);
                selected.push(pool[idx]);
                // Don't remove if we allow multi-hit on same target (handled by bounce logic usually, but here selector selects unique targets?)
                // Usually selector selects *targets*. Bounce hits are generated *from* targets.
                // If random_enemy implies unique targets:
                pool.splice(idx, 1);
            }
            return selected;
        }

        return candidates;
    }

    // Predefined Sorters
    static SortByLowestHP = (a: Unit, b: Unit) => (a.hp / a.stats.hp) - (b.hp / b.stats.hp);
    static SortByHighestATK = (a: Unit, b: Unit) => b.stats.atk - a.stats.atk;
}
