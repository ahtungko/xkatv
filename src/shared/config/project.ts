/** 构建时从 package.json 和 Git 生成，不再重复维护展示信息。 */
export const PROJECT = {
  ...__PROJECT_METADATA__,
} as const
