'use client';

import React from 'react';
import {
    Character,
    ILightConeData,
    RelicSet,
    OrnamentSet,
    IRelicData,
    IOrnamentData,
    CharacterRotationConfig,
} from '@/app/types';
import { RelicEditor } from './RelicEditor';
import { getLightConeDescription } from '@/app/utils/lightConeUtils';
import { getAssetUrl, getCharacterIconPath, getLightConeIconPath } from '@/app/utils/assetUtils';

interface CharacterConfigPanelProps {
    character: Character;
    characterIndex: number;
    lightConeList: ILightConeData[];
    relicSetList: RelicSet[];
    ornamentSetList: OrnamentSet[];
    eidolonLevel: number;
    onEidolonChange: (level: number) => void;
    config: CharacterRotationConfig;
    onCharacterUpdate: (updatedChar: Character) => void;
    onConfigUpdate: (updatedConfig: CharacterRotationConfig) => void;
}

const panelStyle: React.CSSProperties = {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
};

const selectorStyle: React.CSSProperties = {
    backgroundColor: 'black',
    color: 'white',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '4px',
    padding: '6px',
    width: '100%',
};

const labelStyle: React.CSSProperties = {
    fontWeight: 'bold',
    marginBottom: '4px',
    fontSize: '0.95em',
};

const descriptionStyle: React.CSSProperties = {
    fontSize: '0.8em',
    color: '#ccc',
    marginTop: '4px',
    paddingLeft: '8px',
    borderLeft: '2px solid #555',
};

export default function CharacterConfigPanel({
    character,
    characterIndex,
    lightConeList,
    relicSetList,
    ornamentSetList,
    config,
    eidolonLevel,
    onCharacterUpdate,
    onConfigUpdate,
    onEidolonChange,
}: CharacterConfigPanelProps) {
    const selectedLightCone = character.equippedLightCone?.lightCone;
    const superimposition = character.equippedLightCone?.superimposition || 1;

    const handleLightConeChange = (lcId: string) => {
        const newLc = lightConeList.find((lc) => lc.id === lcId);
        const updatedChar = {
            ...character,
            equippedLightCone: newLc
                ? { lightCone: newLc, level: 80, superimposition }
                : undefined,
        };
        onCharacterUpdate(updatedChar);
    };

    const handleSuperimpositionChange = (s: number) => {
        if (selectedLightCone) {
            const updatedChar = {
                ...character,
                equippedLightCone: {
                    lightCone: selectedLightCone,
                    level: 80,
                    superimposition: s as 1 | 2 | 3 | 4 | 5,
                },
            };
            onCharacterUpdate(updatedChar);
        }
    };

    const handleRelicUpdate = (newRelics: IRelicData[], newOrnaments: IOrnamentData[]) => {
        const updatedChar = {
            ...character,
            relics: newRelics,
            ornaments: newOrnaments,
        };
        onCharacterUpdate(updatedChar);
    };

    return (
        <div style={panelStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #555', paddingBottom: '8px' }}>
                {getAssetUrl(getCharacterIconPath(character.id)) && (
                    <img
                        src={getAssetUrl(getCharacterIconPath(character.id))}
                        alt={character.name}
                        style={{ width: '48px', height: '48px', borderRadius: '8px', backgroundColor: '#000' }}
                    />
                )}
                <h3 style={{ margin: 0 }}>
                    {character.name} の設定
                </h3>
            </div>

            {/* 星魂（Eidolon）設定 */}
            <div style={sectionStyle}>
                <label style={labelStyle}>星魂 (凸数)</label>
                <select
                    style={selectorStyle}
                    value={eidolonLevel}
                    onChange={(e) => onEidolonChange(Number(e.target.value))}
                >
                    {[0, 1, 2, 3, 4, 5, 6].map((e) => (
                        <option key={e} value={e}>
                            {e === 0 ? '無凸' : `${e}凸`}
                        </option>
                    ))}
                </select>
            </div>

            {/* 光円錐選択 */}
            <div style={sectionStyle}>
                <label style={labelStyle}>光円錐</label>
                <select
                    style={selectorStyle}
                    value={selectedLightCone?.id || ''}
                    onChange={(e) => handleLightConeChange(e.target.value)}
                >
                    <option value="">装備なし</option>
                    {lightConeList
                        .filter((lc) => lc.path === character.path)
                        .map((lc) => (
                            <option key={lc.id} value={lc.id}>
                                {lc.name}
                            </option>
                        ))}
                </select>

                {selectedLightCone && (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        {getAssetUrl(getLightConeIconPath(selectedLightCone.id)) && (
                            <img
                                src={getAssetUrl(getLightConeIconPath(selectedLightCone.id))}
                                alt={selectedLightCone.name}
                                style={{ width: '64px', height: '64px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#000', flexShrink: 0 }}
                            />
                        )}
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>重畳ランク</label>
                            <select
                                style={selectorStyle}
                                value={superimposition}
                                onChange={(e) => handleSuperimpositionChange(Number(e.target.value))}
                            >
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <option key={s} value={s}>
                                        S{s}
                                    </option>
                                ))}
                            </select>

                            {/* 光円錐の効果説明（重畳ランク対応） */}
                            <div style={descriptionStyle}>
                                {getLightConeDescription(selectedLightCone, superimposition as 1 | 2 | 3 | 4 | 5)}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Rotation Settings (Archer Specific for now) */}
            {
                character.id === 'archar' && (
                    <div style={sectionStyle}>
                        <label style={labelStyle}>行動ロジック設定</label>
                        <select
                            style={selectorStyle}
                            value={config.rotationMode || 'sequence'}
                            onChange={(e) => onConfigUpdate({ ...config, rotationMode: e.target.value as 'sequence' | 'spam_skill' })}
                        >
                            <option value="sequence">通常ローテーション</option>
                            <option value="spam_skill">スキル連続使用 (SP条件)</option>
                        </select>

                        {config.rotationMode === 'spam_skill' && (
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ ...labelStyle, fontSize: '0.9em' }}>発動開始SP閾値</label>
                                <input
                                    type="number"
                                    style={selectorStyle}
                                    value={config.spamSkillTriggerSp ?? 4}
                                    onChange={(e) => onConfigUpdate({ ...config, spamSkillTriggerSp: Number(e.target.value) })}
                                    min={0}
                                />
                                <div style={descriptionStyle}>
                                    SPがこの値以上、かつスキルコスト(2)が払える場合、ローテーションを無視してスキルを使用し続けます。
                                </div>
                            </div>
                        )}
                    </div>
                )
            }

            {/* 遺物編集 */}
            <div style={sectionStyle}>
                <label style={labelStyle}>遺物・オーナメント</label>
                <RelicEditor
                    relics={character.relics || []}
                    ornaments={character.ornaments || []}
                    relicSetList={relicSetList}
                    ornamentSetList={ornamentSetList}
                    onUpdate={handleRelicUpdate}
                />
            </div>
        </div >
    );
}
