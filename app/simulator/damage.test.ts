import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    calculateDamage,
    calculateDamageWithCritInfo,
    calculateCritMultiplierWithInfo,
    calculateToughnessBrokenMultiplier,
    calculateBreakDamage,
    calculateSuperBreakDamage,
    calculateBreakDoTDamage,
    calculateNormalDoTDamage,
    calculateBreakAdditionalDamage,
    calculateNormalAdditionalDamage,
    calculateHeal,
    calculateShield,
    calculateTrueDamage,
    DamageCalculationModifiers,
    calculateDamageToAlly
} from './damage';
import { Unit, Action, ActionContext } from './engine/types';
import { createUnitId } from './engine/unitId';
import { IAbility, Element, Path, StatKey } from '../types';

// Mock Unit Factory
function createMockUnit(overrides: Partial<Unit> = {}): Unit {
    return {
        id: 'unit-1',
        name: 'Test Character',
        isEnemy: false,
        element: 'Physical',
        path: 'Destruction',
        level: 80,
        maxToughness: 100,
        toughness: 100,
        hp: 1000,
        ep: 0,
        stats: {
            hp: 1000,
            atk: 1000,
            def: 1000,
            spd: 100,
            crit_rate: 0.05,
            crit_dmg: 0.5,
            break_effect: 0,
            outgoing_healing_boost: 0,
            max_ep: 140,
            energy_regeneration_rate: 0,
            effect_hit_rate: 0,
            effect_res: 0,
            // Elemental Damage Boosts
            physical_dmg_boost: 0,
            fire_dmg_boost: 0,
            ice_dmg_boost: 0,
            lightning_dmg_boost: 0,
            wind_dmg_boost: 0,
            quantum_dmg_boost: 0,
            imaginary_dmg_boost: 0,
            // Resistances
            physical_res: 0,
            fire_res: 0,
            ice_res: 0,
            lightning_res: 0,
            wind_res: 0,
            quantum_res: 0,
            imaginary_res: 0,
            // Penetration
            physical_res_pen: 0,
            fire_res_pen: 0,
            ice_res_pen: 0,
            lightning_res_pen: 0,
            wind_res_pen: 0,
            quantum_res_pen: 0,
            imaginary_res_pen: 0,
            all_type_res_pen: 0,
            // Generic
            all_type_dmg_boost: 0,
            def_ignore: 0,
            dmg_taken_reduction: 0,
            all_dmg_taken_boost: 0,
            physical_dmg_taken_boost: 0,
        } as any,
        effects: [],
        modifiers: [],
        abilities: {
            basic: {
                id: 'basic',
                description: 'Basic Attack',
                name: 'Basic Atk',
                type: 'Basic ATK',
                targetType: 'single_enemy',
                damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] }
            },
            skill: { id: 'skill', description: 'Skill', name: 'Skill', type: 'Skill', targetType: 'single_enemy' },
            ultimate: { id: 'ult', description: 'Ult', name: 'Ultimate', type: 'Ultimate', targetType: 'single_enemy' },
            talent: { id: 'talent', description: 'Talent', name: 'Talent', type: 'Talent', targetType: 'self' },
            technique: { id: 'tech', description: 'Tech', name: 'Technique', type: 'Technique', targetType: 'self' },
        },
        actionValue: 0,
        ...overrides,
    } as Unit;
}

// Mock Action Factory
function createMockAction(type: Action['type'] = 'BASIC_ATTACK'): Action {
    return {
        type,
        sourceId: 'unit-1',
        targetId: 'unit-2',
    } as Action;
}

describe('Damage Calculation', () => {
    it('should calculate base damage correctly based on ATK scaling', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, atk: 2000 }
        });
        const target = createMockUnit({ isEnemy: true });

        const ability: IAbility = {
            id: 'test-ability',
            description: 'Test Description',
            name: 'Test Attack',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: {
                scaling: 'atk',
                type: 'simple',
                hits: [{ multiplier: 1.5, toughnessReduction: 10 }]
            }
        };

        const action = createMockAction();

        // Mocking randomness to avoid critters interfering with basic math tests? 
        // Ideally we'd mock Math.random, but for now let's set crit rate to 0 to ensure consistency
        source.stats.crit_rate = 0;

        const damage = calculateDamage(source, target, ability, action);

        // Expected: 2000 * 1.5 = 3000
        // Def Multiplier: 80+20 / ((80+20) * (1-0) * (1-0) + 80+20) = 100 / 200 = 0.5
        // Res Multiplier: 1.0 - 0 = 1.0
        // Vuln Multiplier: 1.0
        // Toughness Broken: 0.9 (since toughness > 0)

        // Total: 3000 * 0.5 * 1.0 * 1.0 * 0.9 = 1350

        expect(damage).toBeCloseTo(1350);
    });

    it('should apply elemental damage boost', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, atk: 1000, physical_dmg_boost: 0.2 } // +20% Phys DMG
        });
        const target = createMockUnit({ isEnemy: true });

        const ability: IAbility = {
            id: 'test-ability',
            description: 'Test Description',
            name: 'Test Attack',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: {
                scaling: 'atk',
                type: 'simple',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            }
        };
        source.stats.crit_rate = 0;

        const damage = calculateDamage(source, target, ability, createMockAction());

        // Base: 1000
        // DMGBoost: 1 + 0.2 = 1.2
        // Def: 0.5
        // Toughness: 0.9
        // Expected: 1000 * 1.2 * 0.5 * 0.9 = 540

        expect(damage).toBeCloseTo(540);
    });

    it('should apply defense ignore', () => {
        const source = createMockUnit();
        source.stats.crit_rate = 0;
        source.stats.def_ignore = 0.2; // 20% DEF Ignore

        const target = createMockUnit({ isEnemy: true });

        const ability: IAbility = {
            id: 'test-ability',
            description: 'Test Description',
            name: 'Test Attack',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: {
                scaling: 'atk',
                type: 'simple',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());

        // Base: 1000 * 1.0 = 1000
        // Def Multiplier: 100 / (100 * (1 - 0.2) + 100) = 100 / (80 + 100) = 100 / 180 = 0.5555...
        // Expected: 1000 * 0.5555... * 0.9 = 500

        const expectedDefMult = 100 / (100 * 0.8 + 100);
        const expectedDamage = 1000 * expectedDefMult * 0.9;

        expect(damage).toBeCloseTo(expectedDamage);
    });

    it('should apply resistance penetration', () => {
        const source = createMockUnit();
        source.stats.crit_rate = 0;
        source.stats.physical_res_pen = 0.1; // 10% RES PEN

        const target = createMockUnit({ isEnemy: true });
        target.stats.physical_res = 0.2; // Enemy has 20% RES

        const ability: IAbility = {
            id: 'test-ability',
            description: 'Test Description',
            name: 'Test Attack',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: {
                scaling: 'atk',
                type: 'simple',
                hits: [{ multiplier: 1.0, toughnessReduction: 10 }]
            }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());

        // Res Mult: 1.0 - (0.2 - 0.1) = 0.9
        // Base: 1000
        // Def: 0.5
        // Toughness: 0.9
        // Expected: 1000 * 0.5 * 0.9 * 0.9 = 405

        expect(damage).toBeCloseTo(405);
    });
});

describe('Damage To Ally Calculation', () => {
    it('should calculate basic damage to ally correctly', () => {
        // 敵: Lv80, ATK 1000
        const enemy = createMockUnit({
            id: createUnitId('enemy-1'),
            name: 'Test Enemy',
            isEnemy: true,
            element: 'Physical',
            level: 80,
            stats: { ...createMockUnit().stats, atk: 1000 }
        });

        // 味方: DEF 1000
        const ally = createMockUnit({
            id: createUnitId('ally-1'),
            name: 'Test Ally',
            isEnemy: false,
            stats: { ...createMockUnit().stats, def: 1000 }
        });

        // 敵の基礎ダメージ: ATK * 倍率 = 1000 * 1.0 = 1000
        const baseDamage = 1000;
        const result = calculateDamageToAlly(enemy, ally, baseDamage);

        // 防御係数: 1 - DEF / (DEF + 10*敵Lv + 200)
        // = 1 - 1000 / (1000 + 800 + 200) = 1 - 1000/2000 = 0.5
        const expectedDefMult = 1 - (1000 / (1000 + 10 * 80 + 200));
        expect(expectedDefMult).toBeCloseTo(0.5);

        // 最終ダメージ: 1000 * 1.0 * 0.5 * 1.0 * 1.0 = 500
        expect(result.damage).toBeCloseTo(500);
    });

    it('should apply damage taken reduction', () => {
        const enemy = createMockUnit({
            isEnemy: true,
            level: 80,
            stats: { ...createMockUnit().stats, atk: 1000 }
        });

        // 味方: DEF 1000, 被ダメ軽減 20%
        const ally = createMockUnit({
            isEnemy: false,
            stats: { ...createMockUnit().stats, def: 1000, dmg_taken_reduction: 0.2 }
        });

        const baseDamage = 1000;
        const result = calculateDamageToAlly(enemy, ally, baseDamage);

        // 防御係数: 0.5
        // 被ダメ軽減係数: 1 - 0.2 = 0.8
        // 最終ダメージ: 1000 * 1.0 * 0.5 * 1.0 * 0.8 = 400
        expect(result.damage).toBeCloseTo(400);
        expect(result.breakdownMultipliers.dmgReductionMult).toBeCloseTo(0.8);
    });

    it('should apply ally elemental resistance', () => {
        const enemy = createMockUnit({
            isEnemy: true,
            element: 'Fire', // 炎属性
            level: 80,
            stats: { ...createMockUnit().stats, atk: 1000 }
        });

        // 味方: DEF 1000, 炎耐性 20%
        const ally = createMockUnit({
            isEnemy: false,
            stats: { ...createMockUnit().stats, def: 1000, fire_res: 0.2 }
        });

        const baseDamage = 1000;
        const result = calculateDamageToAlly(enemy, ally, baseDamage);

        // 防御係数: 0.5
        // 属性耐性係数: 1 - 0.2 = 0.8
        // 最終ダメージ: 1000 * 1.0 * 0.5 * 0.8 * 1.0 = 400
        expect(result.damage).toBeCloseTo(400);
        expect(result.breakdownMultipliers.resMult).toBeCloseTo(0.8);
    });

    it('should apply enemy damage dealt reduction (debuff)', () => {
        // 敵に与ダメ減少デバフがある場合
        const enemy = createMockUnit({
            isEnemy: true,
            level: 80,
            stats: { ...createMockUnit().stats, atk: 1000, all_dmg_dealt_reduction: 0.1 } // 10%与ダメ減少
        });

        const ally = createMockUnit({
            isEnemy: false,
            stats: { ...createMockUnit().stats, def: 1000 }
        });

        const baseDamage = 1000;
        const result = calculateDamageToAlly(enemy, ally, baseDamage);

        // 与ダメージ係数: 1 + 0 - 0.1 = 0.9
        // 防御係数: 0.5
        // 最終ダメージ: 1000 * 0.9 * 0.5 * 1.0 * 1.0 = 450
        expect(result.damage).toBeCloseTo(450);
        expect(result.breakdownMultipliers.dmgBoostMult).toBeCloseTo(0.9);
    });
});

// ============================================================
// クリティカルヒット計算
// ============================================================
describe('Critical Hit Calculation', () => {
    // Math.randomをモック化
    let mockRandom: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockRandom = vi.spyOn(Math, 'random');
    });

    afterEach(() => {
        mockRandom.mockRestore();
    });

    it('should not crit when crit rate is 0', () => {
        mockRandom.mockReturnValue(0.5);
        const source = createMockUnit({ stats: { ...createMockUnit().stats, crit_rate: 0, crit_dmg: 0.5 } });
        const result = calculateCritMultiplierWithInfo(source);
        expect(result.isCrit).toBe(false);
        expect(result.multiplier).toBe(1);
    });

    it('should always crit when crit rate is 1.0', () => {
        mockRandom.mockReturnValue(0.99);
        const source = createMockUnit({ stats: { ...createMockUnit().stats, crit_rate: 1.0, crit_dmg: 0.5 } });
        const result = calculateCritMultiplierWithInfo(source);
        expect(result.isCrit).toBe(true);
        expect(result.multiplier).toBe(1.5); // 1 + 0.5
    });

    it('should apply crit dmg correctly', () => {
        mockRandom.mockReturnValue(0);
        const source = createMockUnit({ stats: { ...createMockUnit().stats, crit_rate: 1.0, crit_dmg: 1.5 } });
        const result = calculateCritMultiplierWithInfo(source);
        expect(result.isCrit).toBe(true);
        expect(result.multiplier).toBe(2.5); // 1 + 1.5
    });

    it('should apply dynamic crit modifiers', () => {
        mockRandom.mockReturnValue(0.5);
        const source = createMockUnit({ stats: { ...createMockUnit().stats, crit_rate: 0.3, crit_dmg: 0.5 } });
        const result = calculateCritMultiplierWithInfo(source, { critRate: 0.7, critDmg: 0.5 });
        // Total crit rate = 0.3 + 0.7 = 1.0 (capped)
        // Total crit dmg = 0.5 + 0.5 = 1.0
        expect(result.isCrit).toBe(true);
        expect(result.multiplier).toBe(2.0); // 1 + 1.0
    });
});

// ============================================================
// 脆弱性（Vulnerability）
// ============================================================
describe('Vulnerability Calculation', () => {
    it('should apply elemental vulnerability', () => {
        const source = createMockUnit({
            element: 'Physical',
            stats: { ...createMockUnit().stats, atk: 1000, crit_rate: 0 }
        });
        const target = createMockUnit({
            isEnemy: true,
            stats: { ...createMockUnit().stats, physical_dmg_taken_boost: 0.2 } // 20% Phys Vuln
        });

        const ability: IAbility = {
            id: 'test',
            name: 'Test',
            description: 'Test',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());
        // Base: 1000 * 1.0 = 1000
        // DefMult: 0.5
        // VulnMult: 1.0 + 0.2 = 1.2
        // Toughness: 0.9
        // Expected: 1000 * 0.5 * 1.2 * 0.9 = 540
        expect(damage).toBeCloseTo(540);
    });

    it('should apply all type vulnerability', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, atk: 1000, crit_rate: 0 }
        });
        const target = createMockUnit({
            isEnemy: true,
            stats: { ...createMockUnit().stats, all_dmg_taken_boost: 0.15 } // 15% All Vuln
        });

        const ability: IAbility = {
            id: 'test',
            name: 'Test',
            description: 'Test',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: { scaling: 'atk', type: 'simple', hits: [{ multiplier: 1.0, toughnessReduction: 10 }] }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());
        // Base: 1000
        // DefMult: 0.5
        // VulnMult: 1.0 + 0.15 = 1.15
        // Toughness: 0.9
        expect(damage).toBeCloseTo(1000 * 0.5 * 1.15 * 0.9);
    });
});

// ============================================================
// 弱点撃破状態
// ============================================================
describe('Toughness Broken Multiplier', () => {
    it('should return 0.9 when toughness > 0', () => {
        const target = createMockUnit({ toughness: 50 });
        expect(calculateToughnessBrokenMultiplier(target)).toBe(0.9);
    });

    it('should return 1.0 when toughness = 0 (broken)', () => {
        const target = createMockUnit({ toughness: 0 });
        expect(calculateToughnessBrokenMultiplier(target)).toBe(1.0);
    });
});

// ============================================================
// HPスケーリング
// ============================================================
describe('HP Scaling', () => {
    it('should calculate damage based on HP', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, hp: 10000, crit_rate: 0 }
        });
        const target = createMockUnit({ isEnemy: true });

        const ability: IAbility = {
            id: 'test',
            name: 'Test',
            description: 'Test',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: { scaling: 'hp', type: 'simple', hits: [{ multiplier: 0.1, toughnessReduction: 10 }] }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());
        // Base: 10000 * 0.1 = 1000
        // DefMult: 0.5
        // Toughness: 0.9
        expect(damage).toBeCloseTo(1000 * 0.5 * 0.9);
    });
});

// ============================================================
// DEFスケーリング
// ============================================================
describe('DEF Scaling', () => {
    it('should calculate damage based on DEF', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, def: 2000, crit_rate: 0 }
        });
        const target = createMockUnit({ isEnemy: true });

        const ability: IAbility = {
            id: 'test',
            name: 'Test',
            description: 'Test',
            type: 'Basic ATK',
            targetType: 'single_enemy',
            damage: { scaling: 'def', type: 'simple', hits: [{ multiplier: 0.5, toughnessReduction: 10 }] }
        };

        const damage = calculateDamage(source, target, ability, createMockAction());
        // Base: 2000 * 0.5 = 1000
        // DefMult: 0.5
        // Toughness: 0.9
        expect(damage).toBeCloseTo(1000 * 0.5 * 0.9);
    });
});

// ============================================================
// 撃破ダメージ
// ============================================================
describe('Break Damage', () => {
    it('should calculate break damage for Physical element', () => {
        const source = createMockUnit({
            element: 'Physical',
            level: 80,
            stats: { ...createMockUnit().stats, break_effect: 0 }
        });
        const target = createMockUnit({
            isEnemy: true,
            maxToughness: 60,
            toughness: 0 // Broken
        });

        const damage = calculateBreakDamage(source, target);
        // BaseBreakDmg: LEVEL_MULTIPLIERS[80] = 3767.55
        // ElementMult: Physical = 2.0
        // BreakEffect: 1 + 0 = 1.0
        // ToughnessMult: 0.5 + 60/40 = 2.0
        // DefMult: 0.5
        // Toughness Broken: 1.0
        const expectedBase = 3767.55 * 2.0 * 1.0 * 2.0;
        const expectedDamage = expectedBase * 0.5 * 1.0;
        expect(damage).toBeCloseTo(expectedDamage);
    });

    it('should apply break effect bonus', () => {
        const source = createMockUnit({
            element: 'Ice',
            level: 80,
            stats: { ...createMockUnit().stats, break_effect: 0.5 } // 50% Break Effect
        });
        const target = createMockUnit({
            isEnemy: true,
            maxToughness: 60,
            toughness: 0
        });

        const damage = calculateBreakDamage(source, target);
        // ElementMult: Ice = 1.0
        // BreakEffect: 1 + 0.5 = 1.5
        const expectedBase = 3767.55 * 1.0 * 1.5 * 2.0;
        const expectedDamage = expectedBase * 0.5 * 1.0;
        expect(damage).toBeCloseTo(expectedDamage);
    });
});

// ============================================================
// 超撃破ダメージ
// ============================================================
describe('Super Break Damage', () => {
    it('should return 0 if super break not enabled', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, super_break_dmg_boost: 0 }
        });
        const target = createMockUnit({ isEnemy: true, toughness: 0 });

        const damage = calculateSuperBreakDamage(source, target, 20);
        expect(damage).toBe(0);
    });

    it('should calculate super break damage correctly', () => {
        const source = createMockUnit({
            level: 80,
            stats: { ...createMockUnit().stats, super_break_dmg_boost: 1.0, break_effect: 0.5 }
        });
        const target = createMockUnit({
            isEnemy: true,
            toughness: 0
        });

        const damage = calculateSuperBreakDamage(source, target, 20);
        // LevelMult: 3767.55
        // ToughnessFactor: 20 / 10 = 2.0
        // SuperBreakMult: 1.0
        // BreakEffect: 1 + 0.5 = 1.5
        // DefMult: 0.5
        // Broken: 1.0
        const expectedDamage = 3767.55 * 2.0 * 1.0 * 1.5 * 0.5 * 1.0;
        expect(damage).toBeCloseTo(expectedDamage);
    });
});

// ============================================================
// DoTダメージ
// ============================================================
describe('DoT Damage', () => {
    it('should calculate break DoT damage', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, break_effect: 0.5, dot_dmg_boost: 0.2 }
        });
        const target = createMockUnit({ isEnemy: true, toughness: 0 });

        const baseDamage = 1000;
        const damage = calculateBreakDoTDamage(source, target, baseDamage);
        // DmgBoostMult: (1 + 0.5) * (1 + 0.2) = 1.5 * 1.2 = 1.8
        // DefMult: 0.5
        // Broken: 1.0
        expect(damage).toBeCloseTo(1000 * 1.8 * 0.5 * 1.0);
    });

    it('should calculate normal DoT damage', () => {
        const source = createMockUnit({
            element: 'Fire',
            stats: { ...createMockUnit().stats, fire_dmg_boost: 0.2, all_type_dmg_boost: 0.1, dot_dmg_boost: 0.15 }
        });
        const target = createMockUnit({ isEnemy: true, toughness: 0 });

        const baseDamage = 1000;
        const damage = calculateNormalDoTDamage(source, target, baseDamage);
        // DmgBoostMult: 1 + 0.2 + 0.1 + 0.15 = 1.45
        // DefMult: 0.5
        // Broken: 1.0
        expect(damage).toBeCloseTo(1000 * 1.45 * 0.5 * 1.0);
    });
});

// ============================================================
// 追加ダメージ
// ============================================================
describe('Additional Damage', () => {
    let mockRandom: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockRandom = vi.spyOn(Math, 'random').mockReturnValue(0.5); // No crit for predictable testing
    });

    afterEach(() => {
        mockRandom.mockRestore();
    });

    it('should calculate break additional damage', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, break_effect: 0.5 }
        });
        const target = createMockUnit({ isEnemy: true, toughness: 0 });

        const baseDamage = 1000;
        const damage = calculateBreakAdditionalDamage(source, target, baseDamage);
        // BreakEffect: 1 + 0.5 = 1.5
        // DefMult: 0.5
        // Broken: 1.0
        expect(damage).toBeCloseTo(1000 * 1.5 * 0.5 * 1.0);
    });

    it('should calculate normal additional damage without crit', () => {
        const source = createMockUnit({
            element: 'Physical',
            stats: { ...createMockUnit().stats, crit_rate: 0, physical_dmg_boost: 0.2 }
        });
        const target = createMockUnit({ isEnemy: true, toughness: 0 });

        const baseDamage = 1000;
        const damage = calculateNormalAdditionalDamage(source, target, baseDamage);
        // DmgBoostMult: 1 + 0.2 = 1.2
        // CritMult: 1.0 (no crit)
        // DefMult: 0.5
        // Broken: 1.0
        expect(damage).toBeCloseTo(1000 * 1.2 * 0.5 * 1.0);
    });
});

// ============================================================
// 回復
// ============================================================
describe('Heal Calculation', () => {
    it('should calculate basic heal correctly', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, atk: 2000, outgoing_healing_boost: 0 }
        });
        const target = createMockUnit({
            stats: { ...createMockUnit().stats }
        });

        const heal = calculateHeal(source, target, {
            scaling: 'atk',
            multiplier: 0.2,
            flat: 100
        });
        // BaseHeal: 2000 * 0.2 + 100 = 500
        // HealBoostMult: 1 + 0 + 0 = 1.0
        expect(heal).toBe(500);
    });

    it('should apply outgoing heal boost', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, hp: 10000, outgoing_healing_boost: 0.3 }
        });
        const target = createMockUnit();

        const heal = calculateHeal(source, target, {
            scaling: 'hp',
            multiplier: 0.1
        });
        // BaseHeal: 10000 * 0.1 = 1000
        // HealBoostMult: 1 + 0.3 = 1.3
        expect(heal).toBeCloseTo(1300);
    });

    it('should apply incoming heal boost', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, atk: 1000, outgoing_healing_boost: 0 }
        });
        const target = createMockUnit({
            stats: { ...createMockUnit().stats, incoming_heal_boost: 0.2 }
        });

        const heal = calculateHeal(source, target, {
            scaling: 'atk',
            multiplier: 1.0
        });
        // BaseHeal: 1000
        // HealBoostMult: 1 + 0 + 0.2 = 1.2
        expect(heal).toBeCloseTo(1200);
    });
});

// ============================================================
// シールド
// ============================================================
describe('Shield Calculation', () => {
    it('should calculate basic shield correctly', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, def: 2000 }
        });

        const shield = calculateShield(source, {
            scaling: 'def',
            multiplier: 0.3,
            flat: 200
        });
        // BaseShield: 2000 * 0.3 + 200 = 800
        expect(shield).toBe(800);
    });

    it('should apply shield cap', () => {
        const source = createMockUnit({
            stats: { ...createMockUnit().stats, hp: 50000 }
        });

        const shield = calculateShield(source, {
            scaling: 'hp',
            multiplier: 0.1,
            flat: 0,
            cap: 3000
        });
        // BaseShield: 50000 * 0.1 = 5000
        // Cap: 3000
        expect(shield).toBe(3000);
    });
});

// ============================================================
// 確定ダメージ
// ============================================================
describe('True Damage', () => {
    it('should return base damage without any multipliers', () => {
        const damage = calculateTrueDamage(1000);
        expect(damage).toBe(1000);
    });

    it('should work with decimal values', () => {
        const damage = calculateTrueDamage(1234.56);
        expect(damage).toBeCloseTo(1234.56);
    });
});

