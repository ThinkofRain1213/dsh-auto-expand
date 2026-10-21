/** CSS Modules 的类型声明。 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

/** 图片资源的类型声明（构建期会转成 data URL）。 */
declare module '*.png' {
  const url: string
  export default url
}
