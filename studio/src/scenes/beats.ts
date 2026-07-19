export const receiptStampFrame = (duration: number) => Math.min(76, Math.max(48, Math.floor(duration * 0.5)));
export const receiptTickFrame = (duration: number) => receiptStampFrame(duration) + 8;
export const callCardFrame = (duration: number) => Math.max(70, Math.floor(duration * 0.48));
export const longShotImpactFrame = (duration: number) => callCardFrame(duration) + 10;
