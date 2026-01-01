/**
 * ユニット中央管理システム
 * GameState.units[]を完全に置き換える
 */
import { UnitId } from './unitId';

// Unit型は循環参照を避けるためにインターフェースで定義
// 実際のUnit型は types.ts からインポートされる
export interface IUnit {
    readonly id: UnitId;
    readonly name: string;
    readonly isEnemy: boolean;
    readonly hp: number;
    readonly isSummon?: boolean;
    readonly ownerId?: UnitId;
}

/**
 * イミュータブルなユニットレジストリ
 * 全ての操作は新しいインスタンスを返す
 */
export class UnitRegistry<T extends IUnit = IUnit> {
    private readonly units: ReadonlyMap<UnitId, T>;

    constructor(units: T[] | ReadonlyMap<UnitId, T> = []) {
        if (units instanceof Map) {
            this.units = units;
        } else {
            const map = new Map<UnitId, T>();
            units.forEach(u => map.set(u.id, u));
            this.units = map;
        }
    }

    // ==================== 取得 ====================

    /**
     * ユニットを取得（見つからない場合はundefined）
     */
    get(id: UnitId): T | undefined {
        return this.units.get(id);
    }

    /**
     * ユニットを取得（見つからない場合はエラー）
     */
    getRequired(id: UnitId): T {
        const unit = this.units.get(id);
        if (!unit) {
            throw new Error(`[UnitRegistry] Unit not found: ${id}`);
        }
        return unit;
    }

    /**
     * ユニットが存在するか確認
     */
    has(id: UnitId): boolean {
        return this.units.has(id);
    }

    // ==================== イミュータブル更新 ====================

    /**
     * ユニットを設定/上書き
     */
    set(id: UnitId, unit: T): UnitRegistry<T> {
        const newMap = new Map(this.units);
        newMap.set(id, unit);
        return new UnitRegistry(newMap);
    }

    /**
     * ユニットを更新（関数で変換）
     */
    update(id: UnitId, updater: (unit: T) => T): UnitRegistry<T> {
        const unit = this.units.get(id);
        if (!unit) {
            console.warn(`[UnitRegistry] Cannot update: Unit not found: ${id}`);
            return this;
        }
        return this.set(id, updater(unit));
    }

    /**
     * 複数ユニットを一括更新
     */
    updateMultiple(ids: UnitId[], updater: (unit: T) => T): UnitRegistry<T> {
        let registry: UnitRegistry<T> = this;
        for (const id of ids) {
            registry = registry.update(id, updater);
        }
        return registry;
    }

    /**
     * 条件に一致する全ユニットを更新
     */
    updateWhere(predicate: (unit: T) => boolean, updater: (unit: T) => T): UnitRegistry<T> {
        const newMap = new Map<UnitId, T>();
        this.units.forEach((unit, id) => {
            newMap.set(id, predicate(unit) ? updater(unit) : unit);
        });
        return new UnitRegistry(newMap);
    }

    /**
     * ユニットを削除
     */
    remove(id: UnitId): UnitRegistry<T> {
        if (!this.units.has(id)) {
            return this;
        }
        const newMap = new Map(this.units);
        newMap.delete(id);
        return new UnitRegistry(newMap);
    }

    /**
     * ユニットを追加（既存の場合は上書きしない）
     */
    add(unit: T): UnitRegistry<T> {
        if (this.units.has(unit.id)) {
            console.warn(`[UnitRegistry] Unit already exists: ${unit.id}`);
            return this;
        }
        return this.set(unit.id, unit);
    }

    // ==================== クエリ ====================

    /**
     * 条件に一致するユニットを取得
     */
    filter(predicate: (unit: T) => boolean): T[] {
        return Array.from(this.units.values()).filter(predicate);
    }

    /**
     * 条件に一致する最初のユニットを取得
     */
    find(predicate: (unit: T) => boolean): T | undefined {
        let result: T | undefined;
        this.units.forEach(unit => {
            if (!result && predicate(unit)) {
                result = unit;
            }
        });
        return result;
    }

    /**
     * 全生存ユニットを取得
     */
    getAlive(): T[] {
        return this.filter(u => u.hp > 0);
    }

    /**
     * 指定ユニットの味方を取得
     */
    getAllies(unitId: UnitId): T[] {
        const unit = this.units.get(unitId);
        if (!unit) return [];
        const isEnemy = unit.isEnemy;
        return this.filter(u => u.isEnemy === isEnemy && u.hp > 0);
    }

    /**
     * 指定ユニットの敵を取得
     */
    getEnemies(unitId: UnitId): T[] {
        const unit = this.units.get(unitId);
        if (!unit) return [];
        const isEnemy = unit.isEnemy;
        return this.filter(u => u.isEnemy !== isEnemy && u.hp > 0);
    }

    /**
     * 生存している敵を取得
     */
    getAliveEnemies(): T[] {
        return this.filter(u => u.isEnemy && u.hp > 0);
    }

    /**
     * 生存している味方（敵以外）を取得
     */
    getAliveAllies(): T[] {
        return this.filter(u => !u.isEnemy && u.hp > 0);
    }



    /**
     * 召喚物を取得
     */
    getSummons(ownerId: UnitId): T[] {
        return this.filter(u => u.isSummon === true && u.ownerId === ownerId);
    }

    /**
     * 召喚物の親を取得
     */
    getOwner(summonId: UnitId): T | undefined {
        const summon = this.units.get(summonId);
        if (!summon?.ownerId) return undefined;
        return this.units.get(summon.ownerId);
    }

    // ==================== ユーティリティ ====================

    /**
     * 配列に変換
     */
    toArray(): T[] {
        return Array.from(this.units.values());
    }

    /**
     * IDリストを取得
     */
    getIds(): UnitId[] {
        return Array.from(this.units.keys());
    }

    /**
     * レジストリのサイズ
     */
    get size(): number {
        return this.units.size;
    }

    /**
     * イテレーション
     */
    forEach(callback: (unit: T, id: UnitId) => void): void {
        this.units.forEach((unit, id) => callback(unit, id));
    }

    /**
     * マップ変換
     */
    map<U>(callback: (unit: T) => U): U[] {
        return Array.from(this.units.values()).map(callback);
    }

    /**
     * 全ユニットにreduce
     */
    reduce<U>(callback: (acc: U, unit: T) => U, initial: U): U {
        let result = initial;
        this.units.forEach(unit => {
            result = callback(result, unit);
        });
        return result;
    }

    /**
     * リストから新しいレジストリを作成
     */
    static fromArray<T extends IUnit>(units: T[]): UnitRegistry<T> {
        return new UnitRegistry(units);
    }
}
