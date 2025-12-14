
import { Character, CharacterBaseStats, Enemy } from './app/types';
import { GameState, SimulationConfig } from './app/simulator/engine/types';
import { createInitialGameState } from './app/simulator/engine/gameState';
import { dispatch, applyUnifiedDamage } from './app/simulator/engine/dispatcher';
import { hianshiHandlerFactory, Hianshi } from './app/data/characters/hianshi';
import { addEffect, removeEffect } from './app/simulator/engine/effectManager';
import { calculateActionValue } from './app/simulator/engine/actionValue';

// Mock Enemy
const MOCK_ENEMY: Enemy = {
    id: 'mock-enemy-1',
    name: 'Mock Enemy',
    element: 'Wind',
    baseStats: {
        hp: 100000,
        atk: 1000,
        def: 500,
        spd: 100,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 0
    },
    baseRes: { Wind: 0, Physical: 0, Fire: 0, Ice: 0, Lightning: 0, Quantum: 0, Imaginary: 0 },
    abilities: {
        basic: { id: 'e-basic', name: 'Hit', type: 'Basic ATK', description: 'Hit', damage: { type: 'simple', scaling: 'atk', hits: [{ multiplier: 1, toughnessReduction: 10 }] } },
        skill: { id: 'e-skill', name: 'Skill', type: 'Skill', description: 'Skill' },
        ultimate: { id: 'e-ult', name: 'Ult', type: 'Ultimate', description: 'Ult' },
        talent: { id: 'e-talent', name: 'Talent', type: 'Talent', description: 'Talent' },
        technique: { id: 'e-tech', name: 'Tech', type: 'Technique', description: 'Tech' }
    },
    toughness: 100,
};

// Mock Ally
const MOCK_ALLY: Character = {
    id: 'mock-ally',
    name: 'Ally',
    path: 'Destruction',
    element: 'Physical',
    rarity: 4,
    maxEnergy: 100,
    baseStats: { hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5, aggro: 100 },
    traces: [],
    abilities: { basic: { id: 'b', name: 'B', type: 'Basic ATK', description: 'B', damage: { type: 'simple', scaling: 'atk', hits: [] } }, skill: { id: 's', name: 'S', type: 'Skill', description: 'S' }, ultimate: { id: 'u', name: 'U', type: 'Ultimate', description: 'U' }, talent: { id: 't', name: 'T', type: 'Talent', description: 'T' }, technique: { id: 'te', name: 'Te', type: 'Technique', description: 'Te' } },
    defaultConfig: { rotation: ['b'], ultStrategy: 'immediate', ultCooldown: 0 }
};

// Override Hianshi SPD for Passive Trace Test
const HianshiFast = { ...Hianshi, baseStats: { ...Hianshi.baseStats, spd: 201 } };

const config: SimulationConfig = {
    enemies: [MOCK_ENEMY],
    characters: [HianshiFast, MOCK_ALLY],
    weaknesses: new Set(['Wind']),
    enemyConfig: { level: 80, maxHp: 100000, toughness: 100, spd: 100 },
    rounds: 5
};

async function runTest() {
    console.log('--- Verifying Hianshi Specific Fixes ---');

    // 1. Initialize State
    let state = createInitialGameState(config);
    const hianshiHandler = hianshiHandlerFactory(Hianshi.id, 80);
    state = dispatch(state, { type: 'REGISTER_HANDLERS', handlers: [{ metadata: hianshiHandler.handlerMetadata, logic: hianshiHandler.handlerLogic }] });

    // Trigger Battle Start (Technique & Passives)
    state = dispatch(state, { type: 'BATTLE_START' });

    const hianshiUnit = state.units.find(u => u.id === Hianshi.id)!;

    // --- 2. Passive Traces Verification ---
    console.log('\n--- Passive Traces Verification ---');

    // Smiling Dark Cloud (+100% Crit Rate)
    const traceCrit = hianshiUnit.effects.find(e => e.name.includes('Smiling Dark Cloud'));
    if (traceCrit && traceCrit.modifiers?.some(m => m.target === 'crit_rate' && m.value === 1.0)) {
        console.log('[OK] "Smiling Dark Cloud" Passive applied (Crit Rate +100%)');
    } else {
        console.error('[FAIL] "Smiling Dark Cloud" Passive MISSING or Incorrect');
    }

    // Gentle Thunderstorm (+50% Effect Res)
    const traceRes = hianshiUnit.effects.find(e => e.name.includes('Gentle Thunderstorm'));
    if (traceRes && traceRes.modifiers?.some(m => m.target === 'effect_res' && m.value === 0.5)) {
        console.log('[OK] "Gentle Thunderstorm" Passive applied (Res +50%)');
    } else {
        console.error('[FAIL] "Gentle Thunderstorm" Passive MISSING or Incorrect');
    }

    // Calm Storm (SPD > 200 -> HP +20%)
    const traceHp = hianshiUnit.effects.find(e => e.name.includes('Calm Storm'));
    // Note: HianshiFast has base SPD 201.
    if (traceHp && traceHp.modifiers?.some(m => m.target === 'hp_pct' && m.value === 0.2)) {
        console.log('[OK] "Calm Storm" Passive applied (HP +20% for High SPD)');
    } else {
        console.error(`[FAIL] "Calm Storm" Passive MISSING or Incorrect. SPD is ${hianshiUnit.stats.spd}`);
    }

    // --- 3. Technique Verification ---
    console.log('\n--- Technique Verification ---');

    // Tech Buff: MaxHP +20%
    const ally = state.units.find(u => u.id === MOCK_ALLY.id)!;
    const techBuff = ally.effects.find(e => e.name === 'Sunny Everyone (MaxHP)');
    if (techBuff && techBuff.modifiers?.some(m => m.target === 'hp_pct' && m.value === 0.20)) {
        console.log('[OK] Technique MaxHP Buff applied (+20%)');
    } else {
        console.error('[FAIL] Technique MaxHP Buff MISSING or Incorrect');
    }

    // --- 4. Duration Reduction Verification ---
    console.log('\n--- Duration Reduction Verification ---');
    // Summon Ikarun
    state = dispatch(state, { type: 'SKILL', sourceId: Hianshi.id, targetId: MOCK_ALLY.id });
    const ikarun = state.units.find(u => u.id.startsWith('ikarun-'))!;

    // Add Dummy Buff to Ikarun (Duration 3)
    state = addEffect(state, ikarun.id, {
        id: 'dummy-buff', name: 'Dummy Buff', category: 'BUFF', type: 'Buff', sourceUnitId: Hianshi.id, duration: 3, durationType: 'TURN_END_BASED',
        modifiers: [], apply: (t: any, s: any) => s, remove: (t: any, s: any) => s
    } as any);

    // Trigger duration reduction (Hianshi Auto Skill via Ult -> Action)
    // Ult to get "After Rain"
    state = { ...state, units: state.units.map(u => u.id === Hianshi.id ? { ...u, ep: 140 } : u) };
    state = dispatch(state, { type: 'ULTIMATE', sourceId: Hianshi.id });

    // Action (Skill) to trigger Auto Skill
    state = dispatch(state, { type: 'SKILL', sourceId: Hianshi.id, targetId: MOCK_ALLY.id });

    // Check Buff Duration on Ikarun
    // Initial 3. Reduce by 1 via reduceIkarunDuration.
    const ikarunAfter = state.units.find(u => u.id === ikarun.id)!;
    const dummyBuff = ikarunAfter.effects.find(e => e.id === 'dummy-buff');

    if (dummyBuff) {
        if (dummyBuff.duration === 2) {
            console.log(`[OK] Duration Reduced (3 -> 2)`);
        } else {
            console.error(`[FAIL] Duration Not Reduced Correctly (Expected 2, Got ${dummyBuff.duration})`);
        }
    } else {
        console.error('[FAIL] Dummy Buff Lost (Reduced to 0?)');
    }


    // --- 5. Dismissal Action Advance Verification ---
    console.log('\n--- Dismissal Action Advance Verification ---');
    const hianshiBefore = state.units.find(u => u.id === Hianshi.id)!;
    const initialAV = hianshiBefore.actionValue;
    console.log(`Hianshi AV Before Dismissal: ${initialAV.toFixed(2)}`);

    // Kill Ikarun
    const ikarunKill = state.units.find(u => u.id === ikarun.id)!;
    const mockEnemy = state.units.find(u => u.isEnemy)!;

    // Trigger Death via Damage
    state = applyUnifiedDamage(state, mockEnemy, ikarunKill, 999999, { damageType: 'Action', details: 'Kill' }).state;

    const hianshiAfter = state.units.find(u => u.id === Hianshi.id)!;
    const finalAV = hianshiAfter.actionValue;
    console.log(`Hianshi AV After Dismissal: ${finalAV.toFixed(2)}`);

    // Expected Change: 30% of Base AV.
    // Spd 201 -> Base AV = 10000/201 = 49.75
    // 30% = 14.92 reduction.
    // New AV should be smaller.

    const expectedDiff = calculateActionValue(hianshiAfter.stats.spd) * 0.30;
    const diff = initialAV - finalAV;

    if (finalAV < initialAV) {
        console.log(`AV Reduced by: ${diff.toFixed(2)} (Expected ~${expectedDiff.toFixed(2)})`);
        if (Math.abs(diff - expectedDiff) < 1.0) {
            console.log('[OK] Action Advance correct');
        } else {
            console.log('[WARN] Action Advance amount mismatch');
        }
    } else {
        console.error('[FAIL] Action Value did NOT decrease');
    }

    console.log('--- End Spec Verification ---');
}

runTest().catch(console.error);
