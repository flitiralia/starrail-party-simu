import React, { useState, useEffect } from 'react';
import { IRelicData, IOrnamentData, StatKey, STAT_KEYS, RelicSet, OrnamentSet } from '@/app/types';

// Level 15 5-Star Relic Main Stat Values
const MAIN_STAT_VALUES: Record<string, number> = {
    hp: 705,
    atk: 352,
    spd: 25,
    hp_pct: 0.432,
    atk_pct: 0.432,
    def_pct: 0.540,
    crit_rate: 0.324,
    crit_dmg: 0.648,
    break_effect: 0.648,
    heal_rate: 0.345,
    energy_regen_rate: 0.194,
    effect_hit_rate: 0.432,
    physical_dmg_boost: 0.388,
    fire_dmg_boost: 0.388,
    ice_dmg_boost: 0.388,
    lightning_dmg_boost: 0.388,
    wind_dmg_boost: 0.388,
    quantum_dmg_boost: 0.388,
    imaginary_dmg_boost: 0.388,
};

// Slot Definitions
const RELIC_SLOTS = [
    { id: 'head', name: 'Head (Head)', fixedMainStat: 'hp' },
    { id: 'hands', name: 'Hands (Hands)', fixedMainStat: 'atk' },
    { id: 'body', name: 'Body (Body)', options: ['hp_pct', 'atk_pct', 'def_pct', 'crit_rate', 'crit_dmg', 'heal_rate', 'effect_hit_rate'] },
    { id: 'feet', name: 'Feet (Feet)', options: ['hp_pct', 'atk_pct', 'def_pct', 'spd'] },
    { id: 'sphere', name: 'Planar Sphere', options: ['hp_pct', 'atk_pct', 'def_pct', 'physical_dmg_boost', 'fire_dmg_boost', 'ice_dmg_boost', 'lightning_dmg_boost', 'wind_dmg_boost', 'quantum_dmg_boost', 'imaginary_dmg_boost'] },
    { id: 'rope', name: 'Link Rope', options: ['hp_pct', 'atk_pct', 'def_pct', 'break_effect', 'energy_regen_rate'] },
];

interface RelicEditorProps {
    relics: IRelicData[];
    ornaments: IOrnamentData[];
    relicSetList: RelicSet[];
    ornamentSetList: OrnamentSet[];
    onUpdate: (relics: IRelicData[], ornaments: IOrnamentData[]) => void;
}

export const RelicEditor: React.FC<RelicEditorProps> = ({ relics, ornaments, relicSetList, ornamentSetList, onUpdate }) => {
    // Helper to update a specific relic/ornament
    const updateItem = (type: 'relic' | 'ornament', index: number, newData: IRelicData | IOrnamentData) => {
        if (type === 'relic') {
            const newRelics = [...relics];
            newRelics[index] = newData as IRelicData;
            onUpdate(newRelics, ornaments);
        } else {
            const newOrnaments = [...ornaments];
            newOrnaments[index] = newData as IOrnamentData;
            onUpdate(relics, newOrnaments);
        }
    };

    const handleRelicSetChange = (setId: string) => {
        const newSet = relicSetList.find(s => s.id === setId);
        if (!newSet) return;

        const newRelics = relics.map(r => ({ ...r, set: newSet }));
        onUpdate(newRelics, ornaments);
    };

    const handleOrnamentSetChange = (setId: string) => {
        const newSet = ornamentSetList.find(s => s.id === setId);
        if (!newSet) return;

        const newOrnaments = ornaments.map(o => ({ ...o, set: newSet }));
        onUpdate(relics, newOrnaments);
    };

    const handleMainStatChange = (type: 'relic' | 'ornament', index: number, statKey: string) => {
        const item = type === 'relic' ? relics[index] : ornaments[index];
        const newValue = MAIN_STAT_VALUES[statKey] || 0;

        updateItem(type, index, {
            ...item,
            mainStat: { stat: statKey as StatKey, value: newValue }
        });
    };

    // Global Sub Stats (Stored on Head Relic - relics[0])
    const subStats = relics[0]?.subStats || [];

    const handleSubStatChange = (index: number, field: 'stat' | 'value', val: any) => {
        const newSubStats = [...subStats];
        if (field === 'stat') {
            newSubStats[index] = { ...newSubStats[index], stat: val as StatKey };
        } else {
            newSubStats[index] = { ...newSubStats[index], value: Number(val) };
        }

        // Update Head Relic
        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    const addSubStat = () => {
        // No limit on global sub stats count in this UI, or maybe reasonable limit like 20?
        // Game has 4 per relic * 6 = 24 max.
        if (subStats.length >= 24) return;
        const newSubStats = [...subStats, { stat: 'atk' as StatKey, value: 0 }];
        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    const removeSubStat = (index: number) => {
        const newSubStats = subStats.filter((_, i) => i !== index);
        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    return (
        <div className="p-4 border rounded bg-gray-800 text-white">
            <h3 className="text-lg font-bold mb-4">Relic Stats Configuration</h3>

            {/* Set Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <label className="block text-sm font-bold mb-1">Relic Set (4pc)</label>
                    <select
                        value={relics[0]?.set?.id || ''}
                        onChange={(e) => handleRelicSetChange(e.target.value)}
                        className="w-full p-2 bg-gray-700 rounded text-sm"
                    >
                        <option value="">Select Relic Set</option>
                        {relicSetList.map(set => (
                            <option key={set.id} value={set.id}>{set.name}</option>
                        ))}
                    </select>
                    {/* Relic Set Description */}
                    {relics[0]?.set && (
                        <div className="mt-2 text-xs text-gray-400">
                            {relics[0].set.setBonuses.map((bonus, idx) => (
                                <div key={idx} className="mb-1">
                                    <span className="font-semibold text-gray-300">{bonus.pieces}pc:</span> {bonus.description}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-bold mb-1">Ornament Set (2pc)</label>
                    <select
                        value={ornaments[0]?.set?.id || ''}
                        onChange={(e) => handleOrnamentSetChange(e.target.value)}
                        className="w-full p-2 bg-gray-700 rounded text-sm"
                    >
                        <option value="">Select Ornament Set</option>
                        {ornamentSetList.map(set => (
                            <option key={set.id} value={set.id}>{set.name}</option>
                        ))}
                    </select>
                    {/* Ornament Set Description */}
                    {ornaments[0]?.set && (
                        <div className="mt-2 text-xs text-gray-400">
                            {ornaments[0].set.setBonuses.map((bonus, idx) => (
                                <div key={idx} className="mb-1">
                                    <span className="font-semibold text-gray-300">{bonus.pieces}pc:</span> {bonus.description}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {/* Relics */}
                {relics.map((relic, index) => {
                    const slotId = ['head', 'hands', 'body', 'feet'][index];
                    const slotDef = RELIC_SLOTS.find(s => s.id === slotId);
                    return (
                        <div key={slotId} className="bg-gray-700 p-2 rounded">
                            <div className="text-sm font-bold mb-1">{slotDef?.name}</div>
                            {slotDef?.fixedMainStat ? (
                                <div className="text-xs text-gray-300">
                                    {slotDef.fixedMainStat}: {relic.mainStat.value}
                                </div>
                            ) : (
                                <>
                                    <select
                                        value={relic.mainStat.stat}
                                        onChange={(e) => handleMainStatChange('relic', index, e.target.value)}
                                        className="w-full p-1 bg-gray-600 rounded text-xs mb-1"
                                    >
                                        {slotDef?.options?.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <div className="text-xs text-gray-300">Val: {relic.mainStat.value}</div>
                                </>
                            )}
                        </div>
                    );
                })}

                {/* Ornaments */}
                {ornaments.map((ornament, index) => {
                    const slotId = ['sphere', 'rope'][index];
                    const slotDef = RELIC_SLOTS.find(s => s.id === slotId);
                    return (
                        <div key={slotId} className="bg-gray-700 p-2 rounded">
                            <div className="text-sm font-bold mb-1">{slotDef?.name}</div>
                            <select
                                value={ornament.mainStat.stat}
                                onChange={(e) => handleMainStatChange('ornament', index, e.target.value)}
                                className="w-full p-1 bg-gray-600 rounded text-xs mb-1"
                            >
                                {slotDef?.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <div className="text-xs text-gray-300">Val: {ornament.mainStat.value}</div>
                        </div>
                    );
                })}
            </div>

            {/* Global Sub Stats */}
            <div className="border-t border-gray-600 pt-4">
                <h4 className="text-md font-bold mb-2">Sub Stats (Total)</h4>
                <div className="grid grid-cols-1 gap-2">
                    {subStats.map((sub, index) => (
                        <div key={index} className="flex space-x-2 items-center bg-gray-700 p-1 rounded">
                            <select
                                value={sub.stat}
                                onChange={(e) => handleSubStatChange(index, 'stat', e.target.value)}
                                className="flex-1 p-1 bg-gray-600 rounded text-xs"
                            >
                                {STAT_KEYS.map(key => (
                                    <option key={key} value={key}>{key}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                value={sub.value}
                                onChange={(e) => handleSubStatChange(index, 'value', e.target.value)}
                                className="w-20 p-1 bg-gray-600 rounded text-xs"
                                step="0.1"
                            />
                            <button
                                onClick={() => removeSubStat(index)}
                                className="px-2 text-red-400 hover:text-red-200"
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={addSubStat}
                    className="mt-2 w-full py-1 bg-blue-600 rounded hover:bg-blue-500 text-sm"
                >
                    + Add Sub Stat
                </button>
            </div>
        </div>
    );
};
