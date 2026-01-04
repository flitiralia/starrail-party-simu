'use client';

import React, { useState, useEffect } from 'react';
import { Character, CharacterRotationConfig } from '@/app/types';
import { getAssetUrl, getCharacterIconPath, PATH_NAME_MAP } from '@/app/utils/assetUtils';
import { IconPicker, IconPickerItem } from './IconPicker';

// Internal component for handling rotation input with local state
const RotationInput = ({ config, onUpdate }: { config: CharacterRotationConfig, onUpdate: (rotation: string[]) => void }) => {
    // ハイドレーションエラー回避: 初期値は空文字列で開始し、useEffectで設定
    const [inputValue, setInputValue] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // クライアントマウント後に初期値を設定
    useEffect(() => {
        setIsMounted(true);
        if (config?.rotation && Array.isArray(config.rotation)) {
            setInputValue(config.rotation.join(', '));
        }
    }, []);

    useEffect(() => {
        if (isMounted && !isEditing) {
            setInputValue(config.rotation.join(', '));
        }
    }, [config.rotation, isEditing, isMounted]);

    const handleChange = (val: string) => {
        setInputValue(val);

        let newRotation: string[];
        if (val.includes(',')) {
            newRotation = val.split(',').map((s) => s.trim());
        } else {
            // "sbb" -> ["s", "b", "b"] logic
            newRotation = val.split('').map((s) => s.trim()).filter(s => s.length > 0);
        }

        // Only update if valid characters are present (optional validation could go here)
        onUpdate(newRotation);
    };

    return (
        <input
            type="text"
            style={{
                backgroundColor: 'black',
                color: 'white',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#555',
                borderRadius: '4px',
                padding: '4px',
                width: '100%',
                fontSize: '0.95em',
            }}
            value={inputValue}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setIsEditing(false)}
            placeholder="s, b, b (or sbb)"
        />
    );
};

interface PartySlotCardProps {
    slotIndex: number;
    character: Character | null;
    characterList: Character[];
    onCharacterSelect: (charId: string) => void;
    onRemove: () => void;
    onConfigure: () => void;
    isActive: boolean;
    eidolonLevel: number;
    config?: CharacterRotationConfig;
    onConfigUpdate?: (updatedConfig: CharacterRotationConfig) => void;
    partyMembers: { id: string; name: string; slotIndex: number; }[]; // Add party members list for dropdown
}

const cardStyle: React.CSSProperties = {
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '12px',
    padding: '16px',
    backgroundColor: '#1a1a1a',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minHeight: '120px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
};

const activeCardStyle: React.CSSProperties = {
    ...cardStyle,
    borderColor: '#4a9eff',
    backgroundColor: '#252525',
    boxShadow: '0 0 12px rgba(74, 158, 255, 0.3)',
};

const emptyCardStyle: React.CSSProperties = {
    ...cardStyle,
    borderStyle: 'dashed',
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'default',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
};

const buttonStyle: React.CSSProperties = {
    backgroundColor: '#333',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '4px',
    color: 'white',
    padding: '4px 8px',
    cursor: 'pointer',
    fontSize: '0.85em',
};

const removeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#6d2828',
    borderColor: '#8b3a3a',
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
    fontSize: '0.95em',
};

const infoRowStyle: React.CSSProperties = {
    fontSize: '0.85em',
    color: '#bbb',
    display: 'flex',
    justifyContent: 'space-between',
};

export default function PartySlotCard({
    slotIndex,
    character,
    characterList,
    onCharacterSelect,
    onRemove,
    onConfigure,
    isActive,
    eidolonLevel,
    config,
    onConfigUpdate,
    partyMembers,
}: PartySlotCardProps) {
    if (!character) {
        return (
            <div style={emptyCardStyle}>
                <div style={{ color: '#666', fontSize: '0.9em' }}>
                    空きスロット {slotIndex + 1}
                </div>
            </div>
        );
    }

    const currentCardStyle = isActive ? activeCardStyle : cardStyle;
    const iconUrl = getAssetUrl(getCharacterIconPath(character.id));

    return (
        <div style={{ ...currentCardStyle, position: 'relative', overflow: 'hidden' }} onClick={onConfigure}>
            {/* Background Icon (subtle) */}
            {iconUrl && (
                <div style={{
                    position: 'absolute',
                    top: '-10%',
                    right: '-10%',
                    width: '120px',
                    height: '120px',
                    backgroundImage: `url("${iconUrl}")`, // 引用符を追加
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.15,
                    filter: 'grayscale(50%)',
                    pointerEvents: 'none',
                    zIndex: 0,
                }} />
            )}

            <div style={{ ...headerStyle, position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: isActive ? '#4a9eff' : '#666'
                    }} />
                    <strong style={{ fontSize: '1.1em' }}>スロット {slotIndex + 1}</strong>
                </div>
                <button
                    style={removeButtonStyle}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                >
                    削除
                </button>
            </div>

            <div style={{ position: 'relative', zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                <IconPicker
                    items={characterList.map((c): IconPickerItem => ({
                        id: c.id,
                        name: c.name,
                        iconUrl: getAssetUrl(getCharacterIconPath(c.id)),
                        group: PATH_NAME_MAP[c.path] || c.path,
                    }))}
                    selectedId={character.id}
                    onSelect={(charId) => onCharacterSelect(charId)}
                    placeholder="キャラクター選択"
                />
            </div>

            {/* 凸数表示 (Read-only) */}
            <div style={{ fontSize: '0.85em', color: '#bbb', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 1 }}>
                <span>凸数:</span>
                <span style={{
                    backgroundColor: '#2a2a2a',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid #444',
                    color: '#fff'
                }}>
                    {eidolonLevel === 0 ? '無凸' : `${eidolonLevel}凸`}
                </span>
            </div>

            {/* 秘技使用設定 */}
            {config && (
                <div style={{ fontSize: '0.85em', color: '#bbb', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={config.useTechnique ?? true}
                            onChange={(e) => {
                                if (onConfigUpdate) {
                                    onConfigUpdate({ ...config, useTechnique: e.target.checked });
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer' }}
                        />
                        秘技を使用
                    </label>
                </div>
            )}

            <div style={{ ...infoRowStyle, position: 'relative', zIndex: 1 }}>
                <span>✦ {character.path}</span>
                <span>{character.element}</span>
            </div>

            {character.equippedLightCone && (
                <div style={{ ...infoRowStyle, fontSize: '0.8em', color: '#999', position: 'relative', zIndex: 1 }}>
                    光円錐: {character.equippedLightCone.lightCone.name} (S{character.equippedLightCone.superimposition})
                </div>
            )}

            {/* ローテーション設定 & 必殺技発動方針 */}
            {config && (
                <div style={{ marginTop: '4px', display: 'flex', gap: '12px', position: 'relative', zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                    {/* ローテーション */}
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em', color: '#aaa', display: 'block', marginBottom: '2px' }}>ローテーション:</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <select
                                style={selectorStyle}
                                value={config.rotationMode || 'sequence'}
                                onChange={(e) => {
                                    if (onConfigUpdate) {
                                        onConfigUpdate({ ...config, rotationMode: e.target.value as any });
                                    }
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="sequence">通常</option>
                                <option value="once_skill">初回スキル</option>
                                {character.id === 'archar' && (
                                    <option value="spam_skill">スキル連打</option>
                                )}
                                {['aglaea', 'trailblazer-remembrance', 'hianshi'].includes(character.id) && (
                                    <option value="spirit_based">精霊依存</option>
                                )}
                            </select>

                            {config.rotationMode === 'spam_skill' && character.id === 'archar' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85em', color: '#ccc' }}>
                                    <span>SP閾値:</span>
                                    <input
                                        type="number"
                                        style={{ ...selectorStyle, width: '50px', padding: '2px 4px' }}
                                        value={config.spamSkillTriggerSp ?? 4}
                                        onChange={(e) => {
                                            if (onConfigUpdate) {
                                                onConfigUpdate({ ...config, spamSkillTriggerSp: Number(e.target.value) });
                                            }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        min={0}
                                    />
                                </div>
                            ) : config.rotationMode === 'once_skill' ? (
                                <div style={{ fontSize: '0.75em', color: '#888' }}>
                                    初回:スキル / 以降:通常
                                </div>
                            ) : config.rotationMode === 'spirit_based' ? (
                                <div style={{ fontSize: '0.75em', color: '#888' }}>
                                    精霊あり:通常 / なし:スキル
                                </div>
                            ) : (
                                <RotationInput
                                    config={config}
                                    onUpdate={(newRotation) => {
                                        if (onConfigUpdate) {
                                            onConfigUpdate({ ...config, rotation: newRotation });
                                        }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                    {/* 必殺技発動方針 */}
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8em', color: '#aaa', display: 'block', marginBottom: '2px' }}>必殺技:</label>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.85em', flexWrap: 'wrap' }}>
                            {/* 発動タイミング選択（全キャラ共通） */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <input
                                    type="radio"
                                    value="immediate"
                                    checked={config.ultStrategy === 'immediate'}
                                    onChange={() => onConfigUpdate && onConfigUpdate({ ...config, ultStrategy: 'immediate' })}
                                />
                                即時
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <input
                                    type="radio"
                                    value="cooldown"
                                    checked={config.ultStrategy === 'cooldown'}
                                    onChange={() => onConfigUpdate && onConfigUpdate({ ...config, ultStrategy: 'cooldown' })}
                                />
                                CD制
                            </label>
                            {/* アルジェンティ専用: EPコスト選択 */}
                            {character.id === 'argenti' && (
                                <>
                                    <span style={{ color: '#666', margin: '0 4px' }}>|</span>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <input
                                            type="radio"
                                            name={`${character.id}-ep-option`}
                                            value="argenti_90"
                                            checked={config.ultEpOption === 'argenti_90'}
                                            onChange={() => onConfigUpdate && onConfigUpdate({ ...config, ultEpOption: 'argenti_90' })}
                                        />
                                        90EP
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                        <input
                                            type="radio"
                                            name={`${character.id}-ep-option`}
                                            value="argenti_180"
                                            checked={config.ultEpOption === 'argenti_180'}
                                            onChange={() => onConfigUpdate && onConfigUpdate({ ...config, ultEpOption: 'argenti_180' })}
                                        />
                                        180EP
                                    </label>
                                </>
                            )}
                        </div>
                        {config.ultStrategy === 'cooldown' && (
                            <input
                                type="number"
                                style={{
                                    backgroundColor: 'black',
                                    color: 'white',
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    borderColor: '#555',
                                    borderRadius: '4px',
                                    padding: '2px 4px',
                                    width: '60px',
                                    fontSize: '0.85em',
                                    marginTop: '4px'
                                }}
                                value={config.ultCooldown}
                                onChange={(e) => onConfigUpdate && onConfigUpdate({ ...config, ultCooldown: Number(e.target.value) })}
                                min={0}
                                placeholder="ターン"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Skill Target (Conditional) */}
            {config && character.abilities.skill.manualTargeting && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: '0.8em', color: '#aaa', display: 'block', marginBottom: '2px' }}>
                        {/* 記憶開拓者向けにラベルをカスタマイズ */}
                        {character.id === 'trailblazer-remembrance' ? 'あたしが助ける！対象:' : 'スキル対象:'}
                    </label>
                    <select
                        style={selectorStyle}
                        value={config.skillTargetId || ''}
                        onChange={(e) => {
                            if (onConfigUpdate) {
                                onConfigUpdate({ ...config, skillTargetId: e.target.value });
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="">{character.id === 'trailblazer-remembrance' ? '(ATK最高の味方)' : '(自分/デフォルト)'}</option>
                        {partyMembers
                            .filter(m => m.id !== character.id) // Exclude self if desired, or keep? Usually targets other ally.
                            .map(m => (
                                <option key={m.slotIndex} value={m.id}>
                                    {m.name}
                                </option>
                            ))}
                    </select>
                </div>
            )}
            {/* キャストリス専用設定 */}
            {config && character.id === 'castorice' && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: '0.8em', color: '#aaa', display: 'block', marginBottom: '2px' }}>死竜行動モード:</label>
                    <select
                        style={selectorStyle}
                        value={config.customConfig?.siryuBreathMode ?? 'full'}
                        onChange={(e) => {
                            if (onConfigUpdate) {
                                onConfigUpdate({
                                    ...config,
                                    customConfig: {
                                        ...config.customConfig,
                                        siryuBreathMode: e.target.value as 'full' | 'safe'
                                    }
                                });
                            }
                        }}
                    >
                        <option value="full">全力発動（幽墟奪略の晦翼まで）</option>
                        <option value="safe">安全発動（晦翼発動しない）</option>
                    </select>
                </div>
            )}

            <button
                style={{ ...buttonStyle, marginTop: '4px', width: '100%', position: 'relative', zIndex: 1 }}
                onClick={(e) => {
                    e.stopPropagation();
                    onConfigure();
                }}
            >
                {isActive ? '設定中...' : '詳細設定'}
            </button>
        </div>
    );
}
