/**
 * 与小程序共用的规则代码（赛制、裁剪、打码、校验、时间、默认文案）
 * 直接引用 miniprogram/utils 下的源文件，打包时一并编译，保证两端行为一致
 */
export { isPhaseOpen } from '../../miniprogram/utils/bracket';
export * as crop from '../../miniprogram/utils/crop';
export { maskLdap } from '../../miniprogram/utils/mask';
export { validateLdap, validatePetName, validateCongrats } from '../../miniprogram/utils/validator';
export { formatCountdown, formatDateTime, buildSchedule } from '../../miniprogram/utils/time';
export { DEFAULT_CATEGORIES, DEFAULT_CONFIG } from '../../miniprogram/utils/mock-data';
