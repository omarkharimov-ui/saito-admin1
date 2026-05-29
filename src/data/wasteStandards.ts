export interface WasteStandard {
  keywords: string[];
  wastePercentage: number;
  note: string;
}

export const WASTE_STANDARDS: WasteStandard[] = [
  { keywords: ['avokado', 'avocado', 'avakado'], wastePercentage: 12, note: 'Qabıq + çəyirdək' },
  { keywords: ['kartof', 'potato', 'patates'], wastePercentage: 18, note: 'Qabıq + göz' },
  { keywords: ['somon', 'salmon'], wastePercentage: 8, note: 'Dəri + sümük' },
  { keywords: ['ət', 'mal', 'quzu', 'dana'], wastePercentage: 10, note: 'Pərdə + sümük' },
  { keywords: ['toyuq', 'chicken', 'cücə'], wastePercentage: 12, note: 'Sümük + dəri' },
  { keywords: ['balıq', 'fish', 'xərçəng'], wastePercentage: 15, note: 'Sümük + bağırsaq' },
  { keywords: ['soğan', 'onion', 'sogan'], wastePercentage: 5, note: 'Qabıq + kök' },
  { keywords: ['bibər', 'pepper', 'biber', 'istiot'], wastePercentage: 8, note: 'Toxum + sap' },
  { keywords: ['pomidor', 'tomato', 'domates'], wastePercentage: 3, note: 'Sap yeri' },
  { keywords: ['xiyar', 'cucumber', 'xiyar'], wastePercentage: 5, note: 'Qabıq (arzuolunan)' },
  { keywords: ['limon', 'lemon'], wastePercentage: 40, note: 'Qabıq + toxum' },
  { keywords: ['kələm', 'cabbage', 'kelem', 'kolrabi'], wastePercentage: 15, note: 'Xarici yarpaqlar + kök' },
  { keywords: ['yumurta', 'egg'], wastePercentage: 0, note: 'Itkisiz (qabıq çəkiyə daxil deyil)' },
  { keywords: ['un', 'flour', 'un'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['şəkər', 'sugar', 'seker'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['yağ', 'butter', 'oil', 'yag'], wastePercentage: 0, note: 'Itkisiz (tam istifadə olunur)' },
  { keywords: ['pendir', 'cheese', 'penir'], wastePercentage: 2, note: 'Qabıq (minimal)' },
  { keywords: ['banan'], wastePercentage: 30, note: 'Qabıq' },
  { keywords: ['alma', 'apple'], wastePercentage: 8, note: 'Nüvə + sap' },
  { keywords: ['çiyələk', 'strawberry', 'ciyelek'], wastePercentage: 5, note: 'Sap yarpaq' },
  { keywords: ['üzüm', 'grape', 'uzum'], wastePercentage: 3, note: 'Salxım sapı' },
  { keywords: ['düyü', 'rice', 'düyü'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['makaron', 'pasta', 'spagetti'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['çörək', 'bread', 'corek'], wastePercentage: 5, note: 'Qabıq kənarları' },
  { keywords: ['kök', 'carrot', 'havuc', 'yerkökü'], wastePercentage: 10, note: 'Qabıq + uc' },
  { keywords: ['göbələk', 'mushroom', 'gobelek'], wastePercentage: 5, note: 'Kök hissə' },
  { keywords: ['qaymaq', 'cream', 'kaymak'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['süd', 'milk', 'sud'], wastePercentage: 0, note: 'Itkisiz' },
  { keywords: ['badımcan', 'eggplant', 'badimcan', 'patlıcan'], wastePercentage: 5, note: 'Sap + qabıq' },
  { keywords: ['qarpız', 'watermelon', 'qarpiz'], wastePercentage: 45, note: 'Qabıq + toxum' },
];

export function findWasteStandard(name: string): WasteStandard | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const std of WASTE_STANDARDS) {
    for (const kw of std.keywords) {
      if (lower.includes(kw)) return std;
    }
  }
  return null;
}
