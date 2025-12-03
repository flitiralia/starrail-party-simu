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

    const handleUltStrategyChange = (strategy: 'immediate' | 'cooldown') => {
        onConfigUpdate({
            ...config,
            ultStrategy: strategy,
        });
    };

    const handleUltCooldownChange = (cooldown: number) => {
        onConfigUpdate({
            ...config,
            ultCooldown: cooldown,
        });
    };

    return (
        <div style={panelStyle}>
            <h3 style={{ margin: 0, borderBottom: '1px solid #555', paddingBottom: '8px' }}>
                {character.name} の設定
            </h3>

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
                    <>
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

                        {selectedLightCone.effects.map((e) => (
                            <div key={e.name} style={descriptionStyle}>
                                <strong>{e.name}:</strong> {(e as any).description}
                            </div>
                        ))}
                    </>
                )}
            </div>

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

            {/* 必殺技戦略 */}
            <div style={sectionStyle}>
                <label style={labelStyle}>必殺技発動方針</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="radio"
                            value="immediate"
                            checked={config.ultStrategy === 'immediate'}
                            onChange={() => handleUltStrategyChange('immediate')}
                        />
                        即時発動
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="radio"
                            value="cooldown"
                            checked={config.ultStrategy === 'cooldown'}
                            onChange={() => handleUltStrategyChange('cooldown')}
                        />
                        クールダウン制
                    </label>
                </div>

                {config.ultStrategy === 'cooldown' && (
                    <>
                        <label style={labelStyle}>必殺技クールダウン (ターン数)</label>
                        <input
                            type="number"
                            style={selectorStyle}
                            value={config.ultCooldown}
                            onChange={(e) => handleUltCooldownChange(Number(e.target.value))}
                            min={0}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
