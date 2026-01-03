/**
 * 指定された範囲内のランダムな整数を生成します。
 *
 * @param min - 最小値（この値を含む）
 * @param max - 最大値（この値は含まない）
 * @returns min以上max未満のランダムな整数
 * @throws maxがmin以下の場合はエラーをスロー
 *
 * @example
 * getRandomInt(1, 10); // 1〜9のいずれかの整数を返す
 * getRandomInt(0, 2);  // 0または1を返す
 */
export const getRandomInt = (min: number, max: number): number => {
	if (max <= min) {
		throw new Error("max must be greater than min");
	}
	return Math.floor(Math.random() * (max - min)) + min;
};
