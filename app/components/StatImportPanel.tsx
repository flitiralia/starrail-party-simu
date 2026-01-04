'use client';
import React, { useState } from 'react';
import { Character, StatKey, FinalStats, RelicSet } from '@/app/types';
import { calculateSubStatsFromFinal } from '../simulator/statImport';

interface StatImportPanelProps {
    character: Character;
    onUpdate: (updatedChar: Character) => void;
    relicSetList: RelicSet[];
}

const STAT_INPUT_ORDER: { key: StatKey; label: string; isPercentage?: boolean }[] = [
    { key: 'hp', label: 'HP' },
    { key: 'atk', label: '攻撃力' },
    { key: 'def', label: '防御力' },
    { key: 'spd', label: '速度' },
    { key: 'crit_rate', label: '会心率', isPercentage: true },
    { key: 'crit_dmg', label: '会心ダメージ', isPercentage: true },
    { key: 'break_effect', label: '撃破特効', isPercentage: true },
    { key: 'outgoing_healing_boost', label: '治癒量バフ', isPercentage: true },
    { key: 'energy_regen_rate', label: 'EP回復効率', isPercentage: true },
    { key: 'effect_hit_rate', label: '効果命中', isPercentage: true },
    { key: 'effect_res', label: '効果抵抗', isPercentage: true },
];

const panelStyle: React.CSSProperties = {
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
};

const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginBottom: '12px',
};

const inputContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
};

const labelStyle: React.CSSProperties = {
    fontSize: '0.8em',
    color: '#ccc',
};

const inputStyle: React.CSSProperties = {
    backgroundColor: '#111',
    color: 'white',
    border: '1px solid #555',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '0.9em',
};

const buttonStyle: React.CSSProperties = {
    backgroundColor: '#2980b9',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    cursor: 'pointer',
    width: '100%',
    fontWeight: 'bold',
};

export const StatImportPanel: React.FC<StatImportPanelProps> = ({ character, onUpdate, relicSetList }) => {
    const [inputs, setInputs] = useState<Partial<Record<StatKey, string>>>({});

    const handleInputChange = (key: StatKey, value: string) => {
        setInputs(prev => ({ ...prev, [key]: value }));
    };

    const handleApply = () => {
        console.log('--- Stat Import (SubStats mode) Started ---');

        // 文字列入力を数値に変換
        const finalStats: Partial<FinalStats> = {};
        STAT_INPUT_ORDER.forEach(({ key, isPercentage }) => {
            const val = inputs[key];
            if (val !== undefined && val !== '') {
                const numericVal = parseFloat(val);
                finalStats[key] = isPercentage ? numericVal / 100 : numericVal;
            }
        });

        try {
            // 1. サブステータスとして不足分を計算
            const calculatedSubStats = calculateSubStatsFromFinal(character, finalStats);
            console.log('Calculated SubStats:', calculatedSubStats);

            // 2. キャラクターデータの更新
            // 既存の「ステータス調整エフェクト」は不要になるので削除
            const otherEffects = (character.effects || []).filter(e => e.id !== 'relic-stat-adjustment');

            // サブステータスを relics[0] (頭) に集約して保存する (RelicEditor の仕様に合わせる)
            const updatedRelics = [...(character.relics || [])];
            if (updatedRelics.length === 0) {
                // 遺物がない場合は、デフォルトのセットを使用して頭遺物を作成
                const defaultSet = relicSetList[0];
                if (!defaultSet) {
                    alert('遺物セットデータが見つかりません。');
                    return;
                }
                updatedRelics.push({
                    set: defaultSet,
                    type: 'Head',
                    level: 15,
                    mainStat: { stat: 'hp', value: 705 },
                    subStats: calculatedSubStats,
                });
            } else {
                updatedRelics[0] = {
                    ...updatedRelics[0],
                    subStats: calculatedSubStats
                };
            }

            const updatedChar: Character = {
                ...character,
                relics: updatedRelics,
                effects: otherEffects
            };

            onUpdate(updatedChar);
            alert('不足分を計算し、遺物のサブステータスに反映しました。');
            console.log('--- Stat Import Completed ---');
        } catch (error) {
            console.error('Failed to calculate stats:', error);
            alert(`ステータス計算中にエラーが発生しました: ${error}`);
        }
    };

    return (
        <div style={panelStyle}>
            <div style={{ fontSize: '0.9em', fontWeight: 'bold', marginBottom: '8px', color: '#3498db' }}>
                最終ステータスから逆算（サブステ反映）
            </div>
            <div style={gridStyle}>
                {STAT_INPUT_ORDER.map(({ key, label, isPercentage }) => (
                    <div key={key} style={inputContainerStyle}>
                        <label style={labelStyle}>{label}{isPercentage ? ' (%)' : ''}</label>
                        <input
                            type="number"
                            step={isPercentage ? '0.01' : '1'}
                            style={inputStyle}
                            value={inputs[key] || ''}
                            onChange={(e) => handleInputChange(key, e.target.value)}
                            placeholder="0"
                        />
                    </div>
                ))}
            </div>
            <button style={buttonStyle} onClick={handleApply}>
                数値をサブステに反映
            </button>
            <div style={{ fontSize: '0.7em', color: '#888', marginTop: '8px' }}>
                ※ 入力された数値に合うよう、遺物（1個目）のサブステータスを自動書き換えします。メインステータスや光円錐分は自動的に差し引かれます。
            </div>
        </div>
    );
};
