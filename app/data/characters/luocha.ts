import { Character, Element, Path, StatKey } from '../../types/index';

export const luocha: Character = {
    id: 'luocha',
    name: '羅刹',
    path: 'Abundance',
    element: 'Imaginary',
    rarity: 5,
    maxEnergy: 100,
    baseStats: {
        hp: 1280,
        atk: 756,
        def: 363,
        spd: 101,
        critRate: 0.05,
        critDmg: 0.5,
        aggro: 100,
    },
    abilities: {
        basic: {
            id: 'luocha-basic',
            name: '黒淵の棘',
            type: 'Basic ATK',
            description: '指定した敵単体に羅刹の攻撃力100%分の虚数属性ダメージを与える。',
            targetType: 'single_enemy',
            damage: {
                type: 'simple',
                scaling: 'atk',
                multiplier: 1.0, // Lv.6
            },
            hits: 3,
            toughnessReduction: 10,
            energyGain: 20,
        },
        skill: {
            id: 'luocha-skill',
            name: '白花の祈望',
            type: 'Skill',
            description: '指定した味方単体のHPを回復し、「白花の刻」を1層獲得する。任意の味方単体の残りHPが50%以下の時、その味方をターゲットとして、羅刹の戦闘スキルと同等の効果が1回触発される。この行動はSPを消費しない。この効果は2ターン後に再度触発できる。',
            targetType: 'ally',
            toughnessReduction: 0,
            energyGain: 30
        },
        ultimate: {
            id: 'luocha-ult',
            name: '帰葬の成就',
            type: 'Ultimate',
            description: '敵全体のバフを1つ解除し、ダメージを与え、「白花の刻」を1層獲得する。',
            targetType: 'all_enemies',
            damage: {
                type: 'simple',
                scaling: 'atk',
                multiplier: 2.0, // Lv.10
            },
            toughnessReduction: 20,
            energyGain: 5,
            hits: 1,
        },
        talent: {
            id: 'luocha-talent',
            name: '生者のサイクル',
            type: 'Talent',
            description: '「白花の刻」が2層になると結界を展開する。結界内の敵を味方が攻撃するとHPを回復する。結界は2ターン継続する。',
            targetType: 'self',
            toughnessReduction: 0,
            energyGain: 0,
        },
        technique: {
            id: 'luocha-technique',
            name: '愚者の悲憫',
            type: 'Technique',
            description: '戦闘開始時、天賦の結界を即座に発動する。',
            targetType: 'self',
            toughnessReduction: 0,
        }
    },
    traces: [
        {
            id: 'luocha-trace-a2',
            name: '滴水蘇生',
            type: 'Bonus Ability',
            description: '戦闘スキルの効果発動時、指定した味方単体のデバフを1つ解除する。',
        },
        {
            id: 'luocha-trace-a4',
            name: '清めし塵の身',
            type: 'Bonus Ability',
            description: '結界内の敵を味方が攻撃した時、攻撃者以外の味方も羅刹の攻撃力7.0%+93のHPを回復する。',
        },
        {
            id: 'luocha-trace-a6',
            name: '幽谷を越え',
            type: 'Bonus Ability',
            description: '行動制限系デバフを抵抗する確率+70%。',
        },
        {
            id: 'stat-atk',
            name: '攻撃力',
            type: 'Stat Bonus',
            description: '攻撃力+28.0%',
            stat: 'atk_pct',
            value: 0.28
        },
        {
            id: 'stat-hp',
            name: 'HP',
            type: 'Stat Bonus',
            description: 'HP+18.0%',
            stat: 'hp_pct',
            value: 0.18
        },
        {
            id: 'stat-def',
            name: '防御力',
            type: 'Stat Bonus',
            description: '防御力+12.5%',
            stat: 'def_pct',
            value: 0.125
        },
    ],
    eidolons: {
        e1: {
            level: 1,
            name: '生者による浄化',
            description: '結界発動中、味方全体の攻撃力+20%。',
        },
        e2: {
            level: 2,
            name: '純庭の礼賜',
            description: 'スキル発動時、対象のHPが50%未満なら治癒量+30%。50%以上ならバリアを付与。',
        },
        e3: {
            level: 3,
            name: '愚者の模索',
            description: 'スキルLv+2, 通常攻撃Lv+1',
            abilityModifiers: [
                // Basic Lv.6 -> Lv.7
                { abilityName: 'basic', param: 'damage.multiplier', value: 1.10 }, // 100% -> 110%
                // Ultimate Lv.10 -> Lv.12
                { abilityName: 'ultimate', param: 'damage.multiplier', value: 2.16 }, // 200% -> 216%
            ]
        },
        e4: {
            level: 4,
            name: '荊の審判',
            description: '結界発動中、敵を虚弱状態にし、与ダメージ-12%。',
        },
        e5: {
            level: 5,
            name: '受難の痕',
            description: '必殺技Lv+2, 天賦Lv+2',
            abilityModifiers: [
                // Skill healing: 60%+800 -> 64%+890 (handled in luocha-handler.ts)
                // Note: Skill healing is calculated in applyLuochaSkill, values updated there
                // Talent field healing: 18.0%+240 -> 19.2%+267 (handled in luocha-handler.ts)
                // Note: These values are hardcoded in the handler and need manual update
            ]
        },
        e6: {
            level: 6,
            name: '皆灰燼に帰す',
            description: '必殺技発動時、敵全体の全属性耐性-20%(2ターン)。',
        }
    }
};
