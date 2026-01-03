import React from 'react';
import { IRelicData, IOrnamentData, StatKey, STAT_KEYS, RelicSet, OrnamentSet, RelicMode } from '@/app/types';
import { getAssetUrl, getRelicSetIconPath } from '@/app/utils/assetUtils';
import { IconPicker, IconPickerItem } from './IconPicker';

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
    /** 遺物構成モード（親から制御） */
    relicMode: RelicMode;
    /** 遺物構成モード変更時のコールバック */
    onRelicModeChange: (mode: RelicMode) => void;
}

export const RelicEditor: React.FC<RelicEditorProps> = ({ relics, ornaments, relicSetList, ornamentSetList, onUpdate, relicMode, onRelicModeChange }) => {

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

    // 4セット用: 全遺物に同じセットを適用
    const handleRelicSetChange = (setId: string) => {
        if (setId === '') {
            onUpdate([], ornaments);
            return;
        }
        const newSet = relicSetList.find(s => s.id === setId);
        if (!newSet) return;

        if (relics.length > 0) {
            const newRelics = relics.map(r => ({ ...r, set: newSet }));
            onUpdate(newRelics, ornaments);
        } else {
            const newRelics: IRelicData[] = [
                { set: newSet, type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [] },
                { set: newSet, type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [] },
                { set: newSet, type: 'Body', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
                { set: newSet, type: 'Feet', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
            ];
            onUpdate(newRelics, ornaments);
        }
    };

    // 2+2用: セット1 (Head/Hands) の変更
    const handleRelicSet1Change = (setId: string) => {
        if (setId === '') {
            // 空選択時: Head/Handsを削除（Body/Feetは維持）
            if (relics.length >= 4) {
                const newRelics = relics.slice(2); // Body/Feetのみ残す
                onUpdate(newRelics, ornaments);
            } else {
                onUpdate([], ornaments);
            }
            return;
        }
        const newSet = relicSetList.find(s => s.id === setId);
        if (!newSet) return;

        const currentSet2 = relics[2]?.set || relics[0]?.set;

        if (relics.length >= 4) {
            const newRelics = [...relics];
            newRelics[0] = { ...newRelics[0], set: newSet };
            newRelics[1] = { ...newRelics[1], set: newSet };
            onUpdate(newRelics, ornaments);
        } else if (relics.length >= 2 && currentSet2) {
            // Body/Feetがある場合は4つにする
            const newRelics: IRelicData[] = [
                { set: newSet, type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [] },
                { set: newSet, type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [] },
                relics[0],
                relics[1],
            ];
            onUpdate(newRelics, ornaments);
        } else {
            // 初期化
            const newRelics: IRelicData[] = [
                { set: newSet, type: 'Head', level: 15, mainStat: { stat: 'hp', value: 705 }, subStats: [] },
                { set: newSet, type: 'Hands', level: 15, mainStat: { stat: 'atk', value: 352 }, subStats: [] },
            ];
            onUpdate(newRelics, ornaments);
        }
    };

    // 2+2用: セット2 (Body/Feet) の変更
    const handleRelicSet2Change = (setId: string) => {
        if (setId === '') {
            // 空選択時: Body/Feetを削除（Head/Handsは維持）
            if (relics.length >= 2) {
                const newRelics = relics.slice(0, 2); // Head/Handsのみ残す
                onUpdate(newRelics, ornaments);
            } else {
                onUpdate([], ornaments);
            }
            return;
        }
        const newSet = relicSetList.find(s => s.id === setId);
        if (!newSet) return;

        const currentSet1 = relics[0]?.set;

        if (relics.length >= 4) {
            const newRelics = [...relics];
            newRelics[2] = { ...newRelics[2], set: newSet };
            newRelics[3] = { ...newRelics[3], set: newSet };
            onUpdate(newRelics, ornaments);
        } else if (relics.length >= 2 && currentSet1) {
            // Head/Handsがある場合は4つにする
            const newRelics: IRelicData[] = [
                relics[0],
                relics[1],
                { set: newSet, type: 'Body', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
                { set: newSet, type: 'Feet', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
            ];
            onUpdate(newRelics, ornaments);
        } else {
            // 初期化
            const newRelics: IRelicData[] = [
                { set: newSet, type: 'Body', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
                { set: newSet, type: 'Feet', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
            ];
            onUpdate(newRelics, ornaments);
        }
    };

    // モード切替時の処理
    const handleModeChange = (newMode: RelicMode) => {
        onRelicModeChange(newMode);
        // モード切替時は遺物をリセットしない（既存の状態を維持）
    };

    const handleOrnamentSetChange = (setId: string) => {
        if (setId === '') {
            onUpdate(relics, []);
            return;
        }
        const newSet = ornamentSetList.find(s => s.id === setId);
        if (!newSet) return;

        if (ornaments.length > 0) {
            const newOrnaments = ornaments.map(o => ({ ...o, set: newSet }));
            onUpdate(relics, newOrnaments);
        } else {
            const newOrnaments: IOrnamentData[] = [
                { set: newSet, type: 'Planar Sphere', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
                { set: newSet, type: 'Link Rope', level: 15, mainStat: { stat: 'hp_pct', value: 0.432 }, subStats: [] },
            ];
            onUpdate(relics, newOrnaments);
        }
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

        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    const addSubStat = () => {
        if (subStats.length >= 24) return;
        const newSubStats = [...subStats, { stat: 'atk' as StatKey, value: 0 }];
        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    const removeSubStat = (index: number) => {
        const newSubStats = subStats.filter((_, i) => i !== index);
        updateItem('relic', 0, { ...relics[0], subStats: newSubStats });
    };

    // 現在のセットIDを取得
    const currentSet1Id = relics[0]?.set?.id || '';
    const currentSet2Id = relics[2]?.set?.id || '';

    return (
        <div className="p-4 border rounded bg-gray-800 text-white">
            <h3 className="text-lg font-bold mb-4">Relic Stats Configuration</h3>

            {/* Mode Toggle */}
            <div className="mb-4 flex gap-4 items-center">
                <label className="text-sm font-bold">遺物構成:</label>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        name="relicMode"
                        checked={relicMode === '4pc'}
                        onChange={() => handleModeChange('4pc')}
                        className="accent-blue-500"
                    />
                    <span className="text-sm">4セット</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                    <input
                        type="radio"
                        name="relicMode"
                        checked={relicMode === '2+2'}
                        onChange={() => handleModeChange('2+2')}
                        className="accent-blue-500"
                    />
                    <span className="text-sm">2+2セット</span>
                </label>
            </div>

            {/* Set Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                {relicMode === '4pc' ? (
                    /* 4セットモード */
                    <div>
                        <label className="block text-sm font-bold mb-1">Relic Set (4pc)</label>
                        <IconPicker
                            items={relicSetList.map((set): IconPickerItem => ({
                                id: set.id,
                                name: set.name,
                                iconUrl: getAssetUrl(getRelicSetIconPath(set.id)),
                            }))}
                            selectedId={currentSet1Id}
                            onSelect={(setId) => handleRelicSetChange(setId)}
                            placeholder="遺物セット選択"
                            emptyOption={true}
                            emptyOptionLabel="装備なし"
                        />
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
                ) : (
                    /* 2+2セットモード */
                    <>
                        <div>
                            <label className="block text-sm font-bold mb-1">セット1 (Head/Hands)</label>
                            <IconPicker
                                items={relicSetList.map((set): IconPickerItem => ({
                                    id: set.id,
                                    name: set.name,
                                    iconUrl: getAssetUrl(getRelicSetIconPath(set.id)),
                                }))}
                                selectedId={currentSet1Id}
                                onSelect={(setId) => handleRelicSet1Change(setId)}
                                placeholder="遺物セット選択"
                                emptyOption={true}
                                emptyOptionLabel="選択してください"
                            />
                            {relics[0]?.set && (
                                <div className="mt-2 text-xs text-gray-400">
                                    {relics[0].set.setBonuses.filter(b => b.pieces === 2).map((bonus, idx) => (
                                        <div key={idx} className="mb-1">
                                            <span className="font-semibold text-gray-300">2pc:</span> {bonus.description}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1">セット2 (Body/Feet)</label>
                            <IconPicker
                                items={relicSetList.map((set): IconPickerItem => ({
                                    id: set.id,
                                    name: set.name,
                                    iconUrl: getAssetUrl(getRelicSetIconPath(set.id)),
                                }))}
                                selectedId={currentSet2Id}
                                onSelect={(setId) => handleRelicSet2Change(setId)}
                                placeholder="遺物セット選択"
                                emptyOption={true}
                                emptyOptionLabel="選択してください"
                            />
                            {relics[2]?.set && (
                                <div className="mt-2 text-xs text-gray-400">
                                    {relics[2].set.setBonuses.filter(b => b.pieces === 2).map((bonus, idx) => (
                                        <div key={idx} className="mb-1">
                                            <span className="font-semibold text-gray-300">2pc:</span> {bonus.description}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
                <div>
                    <label className="block text-sm font-bold mb-1">Ornament Set (2pc)</label>
                    <IconPicker
                        items={ornamentSetList.map((set): IconPickerItem => ({
                            id: set.id,
                            name: set.name,
                            iconUrl: getAssetUrl(getRelicSetIconPath(set.id)),
                        }))}
                        selectedId={ornaments[0]?.set?.id || ''}
                        onSelect={(setId) => handleOrnamentSetChange(setId)}
                        placeholder="オーナメント選択"
                        emptyOption={true}
                        emptyOptionLabel="装備なし"
                    />
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
                    const setName = relic.set?.name || '未設定';
                    return (
                        <div key={slotId} className="bg-gray-700 p-2 rounded">
                            <div className="text-sm font-bold mb-1">{slotDef?.name}</div>
                            <div className="text-xs text-blue-300 mb-1">{setName}</div>
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
