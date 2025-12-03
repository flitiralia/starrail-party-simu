'use client';

import React from 'react';
import { Character } from '@/app/types';

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

    const handleRotationChange = (rotation: string) => {
        if (config && onConfigUpdate) {
            onConfigUpdate({
                ...config,
                rotation: rotation.split(',').map((s) => s.trim()),
            });
        }
    };

    return (
        <div style={currentCardStyle} onClick={onConfigure}>
            <div style={headerStyle}>
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

            <select
                style={selectorStyle}
                value={character.id}
                onChange={(e) => {
                    e.stopPropagation();
                    onCharacterSelect(e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {characterList.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>

            {/* 凸数表示 (Read-only) */}
            <div style={{ fontSize: '0.85em', color: '#bbb', display: 'flex', alignItems: 'center', gap: '8px' }}>
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

            <div style={infoRowStyle}>
                <span>✦ {character.path}</span>
                <span>{character.element}</span>
            </div>

            {character.equippedLightCone && (
                <div style={{ ...infoRowStyle, fontSize: '0.8em', color: '#999' }}>
                    光円錐: {character.equippedLightCone.lightCone.name} (S{character.equippedLightCone.superimposition})
                </div>
            )}

            {/* ローテーション設定 (Moved from ConfigPanel) */}
            {config && (
                <div style={{ marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <label style={{ fontSize: '0.8em', color: '#aaa', display: 'block', marginBottom: '2px' }}>ローテーション:</label>
                    <input
                        type="text"
                        style={{ ...selectorStyle, padding: '4px', fontSize: '0.85em' }}
                        value={config.rotation.join(', ')}
                        onChange={(e) => handleRotationChange(e.target.value)}
                        placeholder="s, b, b"
                    />
                </div>
            )}

            <button
                style={{ ...buttonStyle, marginTop: '4px', width: '100%' }}
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
