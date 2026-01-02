'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * アイコンピッカーのアイテム定義
 */
export interface IconPickerItem {
    id: string;
    name: string;
    iconUrl?: string;
    group?: string;  // グループ化用（例: Path, Element）
}

interface IconPickerProps {
    items: IconPickerItem[];
    selectedId?: string;
    onSelect: (id: string) => void;
    placeholder?: string;
    emptyOption?: boolean;
    emptyOptionLabel?: string;
    disabled?: boolean;
}

// スタイル定義
const triggerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    backgroundColor: '#1a1a1a',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '6px',
    cursor: 'pointer',
    minWidth: '180px',
    color: 'white',
    fontSize: '0.9em',
};

const triggerDisabledStyle: React.CSSProperties = {
    ...triggerStyle,
    cursor: 'not-allowed',
    opacity: 0.6,
};

const iconStyle: React.CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: '4px',
    backgroundColor: '#000',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    objectFit: 'cover',
};

const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    padding: '12px',
    backgroundColor: '#111111',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.9)',
    zIndex: 99999,
    maxHeight: '400px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    minWidth: '300px',
};

const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
    gap: '8px',
};

const itemStyle: React.CSSProperties = {
    width: '52px',
    height: '52px',
    borderRadius: '6px',
    backgroundColor: '#2a2a2a',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#444',
    cursor: 'pointer',
    overflow: 'hidden',
    transition: 'border-color 0.15s ease, transform 0.1s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const itemSelectedStyle: React.CSSProperties = {
    ...itemStyle,
    borderColor: '#4a9eff',
    boxShadow: '0 0 12px rgba(74, 158, 255, 0.6)',
};

const itemHoverStyle: React.CSSProperties = {
    borderColor: '#888',
    transform: 'scale(1.08)',
};

const itemImageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
};

const placeholderIconStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.6em',
    color: '#666',
};

const emptyItemStyle: React.CSSProperties = {
    ...itemStyle,
    fontSize: '0.8em',
    color: '#888',
    textAlign: 'center' as const,
};

const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '4px',
    padding: '4px 8px',
    backgroundColor: '#222',
    color: 'white',
    fontSize: '0.75em',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    zIndex: 100000,
    pointerEvents: 'none',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
};

const groupLabelStyle: React.CSSProperties = {
    fontSize: '0.8em',
    color: '#aaa',
    marginTop: '12px',
    marginBottom: '6px',
    paddingBottom: '4px',
    borderBottom: '1px solid #444',
    fontWeight: 'bold',
};

/**
 * アイコンピッカーコンポーネント
 * キャラクター、光円錐、遺物の選択に使用する汎用コンポーネント
 * React Portalを使用してドロップダウンをbody直下に描画し、z-index問題を回避
 */
export const IconPicker: React.FC<IconPickerProps> = ({
    items,
    selectedId,
    onSelect,
    placeholder = '選択してください',
    emptyOption = false,
    emptyOptionLabel = '装備なし',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 現在選択中のアイテム
    const selectedItem = items.find(item => item.id === selectedId);

    // ドロップダウンの位置を計算
    const updateDropdownPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = 400; // maxHeight

            // 下に十分なスペースがあれば下に、なければ上に表示
            if (spaceBelow >= dropdownHeight || spaceBelow > rect.top) {
                setDropdownPosition({
                    top: rect.bottom + 4,
                    left: rect.left,
                });
            } else {
                setDropdownPosition({
                    top: rect.top - dropdownHeight - 4,
                    left: rect.left,
                });
            }
        }
    };

    // 外側クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(event.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        const handleScroll = () => {
            if (isOpen) {
                updateDropdownPosition();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', handleScroll, true);
            updateDropdownPosition();
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isOpen]);

    const handleSelect = (id: string) => {
        onSelect(id);
        setIsOpen(false);
    };

    const handleTriggerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!disabled) {
            setIsOpen(!isOpen);
        }
    };

    // ドロップダウン内スクロールの伝播防止
    const handleDropdownWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
    };

    // グループ化されたアイテムを作成
    const groupedItems = items.reduce((acc, item) => {
        const group = item.group || '';
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(item);
        return acc;
    }, {} as Record<string, IconPickerItem[]>);

    const hasGroups = Object.keys(groupedItems).some(group => group !== '');

    // ドロップダウンコンテンツ
    const dropdownContent = (
        <div
            ref={dropdownRef}
            style={{
                ...dropdownStyle,
                top: dropdownPosition.top,
                left: dropdownPosition.left,
            }}
            onWheel={handleDropdownWheel}
            onClick={(e) => e.stopPropagation()}
        >
            {hasGroups ? (
                // グループ化表示
                Object.entries(groupedItems).map(([group, groupItems], groupIndex) => (
                    <div key={group}>
                        {group && <div style={groupLabelStyle}>{group}</div>}
                        <div style={gridStyle}>
                            {/* 空オプション（最初のグループのみ） */}
                            {groupIndex === 0 && emptyOption && (
                                <div
                                    style={{
                                        ...emptyItemStyle,
                                        ...(selectedId === '' ? itemSelectedStyle : {}),
                                    }}
                                    onClick={() => handleSelect('')}
                                    title={emptyOptionLabel}
                                >
                                    ✕
                                </div>
                            )}
                            {groupItems.map(item => (
                                <div
                                    key={item.id}
                                    style={{
                                        ...itemStyle,
                                        ...(item.id === selectedId ? itemSelectedStyle : {}),
                                        ...(item.id === hoveredId ? itemHoverStyle : {}),
                                        position: 'relative',
                                    }}
                                    onClick={() => handleSelect(item.id)}
                                    onMouseEnter={() => setHoveredId(item.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    title={item.name}
                                >
                                    {item.iconUrl ? (
                                        <img
                                            src={item.iconUrl}
                                            alt={item.name}
                                            style={itemImageStyle}
                                        />
                                    ) : (
                                        <div style={placeholderIconStyle}>?</div>
                                    )}
                                    {/* ツールチップ */}
                                    {item.id === hoveredId && (
                                        <div style={tooltipStyle}>{item.name}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            ) : (
                // フラット表示
                <div style={gridStyle}>
                    {emptyOption && (
                        <div
                            style={{
                                ...emptyItemStyle,
                                ...(selectedId === '' ? itemSelectedStyle : {}),
                            }}
                            onClick={() => handleSelect('')}
                            title={emptyOptionLabel}
                        >
                            ✕
                        </div>
                    )}
                    {items.map(item => (
                        <div
                            key={item.id}
                            style={{
                                ...itemStyle,
                                ...(item.id === selectedId ? itemSelectedStyle : {}),
                                ...(item.id === hoveredId ? itemHoverStyle : {}),
                                position: 'relative',
                            }}
                            onClick={() => handleSelect(item.id)}
                            onMouseEnter={() => setHoveredId(item.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            title={item.name}
                        >
                            {item.iconUrl ? (
                                <img
                                    src={item.iconUrl}
                                    alt={item.name}
                                    style={itemImageStyle}
                                />
                            ) : (
                                <div style={placeholderIconStyle}>?</div>
                            )}
                            {/* ツールチップ */}
                            {item.id === hoveredId && (
                                <div style={tooltipStyle}>{item.name}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <>
            {/* トリガーボタン */}
            <div
                ref={triggerRef}
                style={disabled ? triggerDisabledStyle : triggerStyle}
                onClick={handleTriggerClick}
            >
                {selectedItem?.iconUrl ? (
                    <img
                        src={selectedItem.iconUrl}
                        alt={selectedItem.name}
                        style={iconStyle}
                    />
                ) : (
                    <div style={{ ...iconStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.6em', color: '#666' }}>?</span>
                    </div>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedItem?.name || placeholder}
                </span>
                <span style={{ color: '#888', fontSize: '0.8em' }}>▼</span>
            </div>

            {/* ドロップダウン (Portal経由でbody直下にレンダリング) */}
            {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
        </>
    );
};

export default IconPicker;
