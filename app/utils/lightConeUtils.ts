import { ILightConeData } from '@/app/types';

/**
 * 重畳ランクに応じた光円錐の効果説明文を生成
 * @param lightCone 光円錐データ
 * @param superimposition 重畳ランク (1-5)
 * @returns 説明文
 */
export function getLightConeDescription(
    lightCone: ILightConeData,
    superimposition: 1 | 2 | 3 | 4 | 5
): string {
    // テンプレートが無い場合は静的な説明文を返す
    if (!lightCone.descriptionTemplate || !lightCone.descriptionValues) {
        return lightCone.description;
    }

    const values = lightCone.descriptionValues[superimposition - 1];
    let result = lightCone.descriptionTemplate;

    values.forEach((value, index) => {
        result = result.replace(new RegExp(`\\{${index}\\}`, 'g'), value);
    });

    return result;
}
