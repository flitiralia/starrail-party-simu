import { GameState, Unit } from './types';
import { FinalStats, Modifier } from '../../types/stats';
import { UnitId, createUnitId } from './unitId';
import { Element } from '../../types/index';

/**
 * Template for creating a generic summon unit.
 */
export interface SummonTemplate {
    idPrefix: string;
    name: string;
    baseStats: FinalStats;
    baseSpd: number;
    element: Element;
    abilities: Unit['abilities'];
    modifiers?: Modifier[];
    untargetable?: boolean; // Default true
    debuffImmune?: boolean; // If true, immune to all debuffs
}

import { UnitRegistry } from './unitRegistry';

/**
 * Helper to get an active summon owned by a specific unit.
 * @param state Current GameState
 * @param ownerId ID of the owner unit
 * @param idPrefix Optional prefix to filter specific summon types
 */
export function getActiveSummon(state: GameState, ownerId: string, idPrefix?: string): Unit | undefined {
    return state.registry.find(u =>
        u.isSummon === true &&
        u.ownerId === ownerId &&
        (!idPrefix || u.id.startsWith(idPrefix))
    );
}

/**
 * Helper to remove a specific summon from the state.
 */
export function removeSummon(state: GameState, summonId: string): GameState {
    return {
        ...state,
        registry: state.registry.remove(createUnitId(summonId))
    };
}

/**
 * Generic factory to create a summon unit based on a template.
 * @param owner The unit creating the summon.
 * @param template The template definitions for the summon.
 */
export function createSummon(owner: Unit, template: SummonTemplate): Unit {
    return {
        id: createUnitId(`${template.idPrefix}-${owner.id}`),
        name: template.name,
        isEnemy: false,
        isSummon: true,
        untargetable: template.untargetable !== undefined ? template.untargetable : true,
        debuffImmune: template.debuffImmune || false,
        ownerId: owner.id,
        linkedUnitId: undefined, // Can be set after creation if needed
        element: template.element,
        level: owner.level,
        baseStats: {
            ...template.baseStats,
            spd: template.baseSpd // Ensure SPD is set
        },
        stats: {
            ...template.baseStats,
            spd: template.baseSpd
        },
        hp: template.baseStats.hp,
        ep: 0,
        shield: 0,
        toughness: 0,
        maxToughness: 0,
        weaknesses: new Set(),
        modifiers: template.modifiers || [],
        effects: [],
        actionValue: 10000 / template.baseSpd,
        rotationIndex: 0,
        ultCooldown: 0,
        config: {
            rotation: ['s'], // Logic usually overrides this
            ultStrategy: 'immediate',
            ultCooldown: 0,
        },
        abilities: template.abilities
    };
}

/**
 * Insert a summon unit immediately after its owner in the units array.
 * Per spec: "n番目のキャラが召喚するとn番目とn+1番目の間に召喚される"
 * @param state Current GameState
 * @param summon The summon unit to insert
 * @param ownerId ID of the owner unit
 */
export function insertSummonAfterOwner(
    state: GameState,
    summon: Unit,
    ownerId: string
): GameState {
    const units = state.registry.toArray();
    const ownerIndex = units.findIndex(u => u.id === ownerId);
    let newUnits: Unit[];
    if (ownerIndex === -1) {
        // Fallback: append to end if owner not found
        newUnits = [...units, summon];
    } else {
        const before = units.slice(0, ownerIndex + 1);
        const after = units.slice(ownerIndex + 1);
        newUnits = [...before, summon, ...after];
    }
    return { ...state, registry: UnitRegistry.fromArray(newUnits) };
}
