import { describe, test, expect, beforeEach } from 'vitest';
import { lingsha, lingshaHandlerFactory } from './lingsha';
import { UnitRegistry } from '../../simulator/engine/unitRegistry';
import { GameState, Unit, IEventHandler } from '../../simulator/engine/types';
import { createUnitId } from '../../simulator/engine/unitId';
import { initializeActionQueue } from '../../simulator/engine/actionValue';
import { addEffect } from '../../simulator/engine/effectManager';

// Mock setup
const createMockState = (): GameState => {
    const registry = new UnitRegistry<Unit>();
    return {
        registry,
        skillPoints: 3,
        maxSkillPoints: 5,
        time: 0,
        log: [],
        eventHandlers: [],
        eventHandlerLogics: {},
        damageModifiers: {},
        cooldowns: {},
        cooldownMetadata: {},
        pendingActions: [],
        actionQueue: [],
        result: {
            totalDamageDealt: 0,
            characterStats: {}
        },
        auras: []
    };
};

const createMockUnit = (id: string, isEnemy: boolean = false): Unit => {
    return {
        id: createUnitId(id),
        name: id,
        isEnemy,
        element: 'Fire',
        level: 80,
        abilities: {
            basic: { id: 'basic', name: 'Basic', type: 'Basic ATK', description: '' },
            skill: { id: 'skill', name: 'Skill', type: 'Skill', description: '' },
            ultimate: { id: 'ult', name: 'Ult', type: 'Ultimate', description: '' },
            talent: { id: 'talent', name: 'Talent', type: 'Talent', description: '' },
            technique: { id: 'tech', name: 'Tech', type: 'Technique', description: '' }
        },
        baseStats: { hp: 1000, atk: 1000, def: 1000, spd: 100, crit_rate: 0.05, crit_dmg: 0.5, aggro: 100, max_ep: 100 } as any,
        stats: {
            hp: 1000, atk: 1000, def: 1000, spd: 100, crit_rate: 0.05, crit_dmg: 0.5, aggro: 100,
            hp_pct: 0, atk_pct: 0, def_pct: 0, spd_pct: 0,
            break_effect: 0, effect_hit_rate: 0, effect_res: 0, energy_regen_rate: 0, max_ep: 100,
            outgoing_healing_boost: 0, incoming_heal_boost: 0, shield_strength_boost: 0,
            physical_dmg_boost: 0, fire_dmg_boost: 0, ice_dmg_boost: 0, lightning_dmg_boost: 0, wind_dmg_boost: 0, quantum_dmg_boost: 0, imaginary_dmg_boost: 0, all_type_dmg_boost: 0,
            physical_res_pen: 0, fire_res_pen: 0, ice_res_pen: 0, lightning_res_pen: 0, wind_res_pen: 0, quantum_res_pen: 0, imaginary_res_pen: 0, all_type_res_pen: 0,
            physical_res: 0, fire_res: 0, ice_res: 0, lightning_res: 0, wind_res: 0, quantum_res: 0, imaginary_res: 0, crowd_control_res: 0,
            bleed_res: 0, burn_res: 0, frozen_res: 0, shock_res: 0, wind_shear_res: 0, entanglement_res: 0, imprisonment_res: 0,
            all_type_vuln: 0, break_dmg_taken: 0, dot_dmg_taken: 0,
            physical_vuln: 0, fire_vuln: 0, ice_vuln: 0, lightning_vuln: 0, wind_vuln: 0, quantum_vuln: 0, imaginary_vuln: 0,
            def_reduction: 0, def_ignore: 0,
            break_efficiency_boost: 0, break_dmg_boost: 0, super_break_dmg_boost: 0,
            fua_dmg_boost: 0, dot_dmg_boost: 0, dot_def_ignore: 0,
            all_dmg_dealt_reduction: 0, dmg_taken_reduction: 0,
            basic_atk_dmg_boost: 0, skill_dmg_boost: 0, ult_dmg_boost: 0
        },
        hp: 1000, ep: 50, shield: 0, toughness: 30, maxToughness: 30,
        weaknesses: new Set(['Fire']),
        modifiers: [],
        effects: [],
        actionValue: 100,
        rotationIndex: 0,
        ultCooldown: 0
    };
};

describe('Lingsha Implementation', () => {
    let state: GameState;
    let lingshaUnit: Unit;
    let enemy: Unit;

    beforeEach(() => {
        state = createMockState();
        lingshaUnit = {
            ...createMockUnit('lingsha', false),
            ...lingsha, // Merge char def
            id: createUnitId('lingsha'),
            abilities: lingsha.abilities,
            baseStats: { ...lingsha.baseStats, hp: 1000, atk: 1000, def: 500, spd: 100, max_ep: 100 } as any,
            stats: {
                ...createMockUnit('lingsha', false).stats,
                hp: 1000, atk: 1000, def: 500, spd: 100,
                break_effect: 1.0 // 100% BE
            },
            traces: lingsha.traces
        };
        enemy = createMockUnit('enemy', true);

        state = {
            ...state,
            registry: state.registry.add(lingshaUnit).add(enemy)
        };

        const { handlerMetadata, handlerLogic } = lingshaHandlerFactory('lingsha', 80, 0);
        state.eventHandlers.push(handlerMetadata);
        state.eventHandlerLogics[handlerMetadata.id] = handlerLogic;

        state = handlerLogic({ type: 'ON_BATTLE_START', sourceId: 'lingsha' } as any, state, handlerMetadata.id);
    });

    test('Technique Spawns Fuyuan', () => {
        // Simulating Battle Start with Technique (already simulated in beforeEach)
        const fuyuan = state.registry.get(createUnitId('lingsha-fuyuan'));
        expect(fuyuan).toBeDefined();
        expect(fuyuan?.name).toBe('浮元');
        const countEffect = fuyuan?.effects.find(e => e.id === 'lingsha-fuyuan-count');
        expect(countEffect?.stackCount).toBe(3);
    });

    test('A2 Trace: BE Conversion', () => {
        // Lingsha has 100% BE.
        // A2: 25% BE -> ATK (max 50%), 10% BE -> Heal (max 20%).
        // Expected: +25% ATK, +10% Heal.
        const lingshaInState = state.registry.get(createUnitId('lingsha'));
        const a2Buff = lingshaInState?.effects.find(e => e.id === 'lingsha-a2-buff');
        expect(a2Buff).toBeDefined();

        const atkMod = a2Buff?.modifiers?.find(m => m.target === 'atk_pct');
        const healMod = a2Buff?.modifiers?.find(m => m.target === 'outgoing_healing_boost');

        expect(atkMod?.value).toBeCloseTo(0.25);
        expect(healMod?.value).toBeCloseTo(0.10);
    });

    test('Skill Increases Fuyuan Count', () => {
        // Initial Count: 3
        // Skill -> +3 -> 5 (Max)

        const action = {
            type: 'SKILL',
            sourceId: 'lingsha',
            targetId: 'enemy'
        };
        // Apply SKILL Action (simulate pipeline dispatching ON_SKILL_USED)
        const { handlerLogic } = lingshaHandlerFactory('lingsha', 80, 0);
        state = handlerLogic({ type: 'ON_SKILL_USED', sourceId: 'lingsha', targetId: 'enemy' } as any, state, 'lingsha-handler-lingsha');

        const fuyuan = state.registry.get(createUnitId('lingsha-fuyuan'));
        const countEffect = fuyuan?.effects.find(e => e.id === 'lingsha-fuyuan-count');
        expect(countEffect?.stackCount).toBe(5);
    });

    test('Fuyuan Action Logic', () => {
        const fuyuanId = 'lingsha-fuyuan';
        const fuyuan = state.registry.get(createUnitId(fuyuanId));
        if (!fuyuan) throw new Error('Fuyuan missing');

        // Trigger Turn Start for Fuyuan
        const { handlerLogic } = lingshaHandlerFactory('lingsha', 80, 0);
        state = handlerLogic({ type: 'ON_TURN_START', sourceId: fuyuanId } as any, state, 'lingsha-handler-lingsha');

        // Should damage enemy
        // Should reduce count by 1 -> 2
        const updatedFuyuan = state.registry.get(createUnitId(fuyuanId));
        const countEffect = updatedFuyuan?.effects.find(e => e.id === 'lingsha-fuyuan-count');
        expect(countEffect?.stackCount).toBe(2);

        // Should heal ally
        // Can't easily check heal without logs or HP change (ally was full HP).
        // Let's damage ally first.
        state = {
            ...state,
            registry: state.registry.update(createUnitId('lingsha'), u => ({ ...u, hp: 500 }))
        };

        // Trigger again
        state = handlerLogic({ type: 'ON_TURN_START', sourceId: fuyuanId } as any, state, 'lingsha-handler-lingsha');

        const healedLingsha = state.registry.get(createUnitId('lingsha'));
        expect(healedLingsha?.hp).toBeGreaterThan(500);
    });

    test('A6 Trace: Trigger on Low HP', () => {
        // Set Lingsha HP to 50%
        state = {
            ...state,
            registry: state.registry.update(createUnitId('lingsha'), u => ({ ...u, hp: 500, stats: { ...u.stats, hp: 1000 } }))
        };

        // Initial Count: 3
        const fuyuanBefore = state.registry.get(createUnitId('lingsha-fuyuan'));
        const countBefore = fuyuanBefore?.effects.find(e => e.id === 'lingsha-fuyuan-count')?.stackCount;

        // Trigger HP Consumption Event
        const { handlerLogic } = lingshaHandlerFactory('lingsha', 80, 0);
        state = handlerLogic({
            type: 'ON_HP_CONSUMED',
            sourceId: 'lingsha',
            targetId: 'lingsha',
            amount: 100
        } as any, state, 'lingsha-handler-lingsha');

        // A6 should trigger Fuyuan Action (Extra Action)
        // Count should NOT decrease (isExtraAction = true)
        const fuyuanAfter = state.registry.get(createUnitId('lingsha-fuyuan'));
        const countAfter = fuyuanAfter?.effects.find(e => e.id === 'lingsha-fuyuan-count')?.stackCount;

        expect(countAfter).toBe(countBefore);

        // CD should be applied
        const cdEffect = state.registry.get(createUnitId('lingsha'))?.effects.find(e => e.id === 'lingsha-a6-cd');
        expect(cdEffect).toBeDefined();
    });

    test('A4 Trace: Basic ATK Energy', () => {
        // Trigger Basic ATK
        const { handlerLogic } = lingshaHandlerFactory('lingsha', 80, 0);
        const epBefore = state.registry.get(createUnitId('lingsha'))?.ep || 0;

        state = handlerLogic({ type: 'ON_BASIC_ATTACK', sourceId: 'lingsha' } as any, state, 'lingsha-handler-lingsha');

        const epAfter = state.registry.get(createUnitId('lingsha'))?.ep || 0;
        expect(epAfter).toBe(epBefore + 10);
    });
});
