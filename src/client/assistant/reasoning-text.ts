/**
 * 模型思考的显示文本准备。
 *
 * 克隆自 `reasoning-text.ts`（0.2.2-rc.1 新增）。
 * 上游：@deepseek-ai/dsh-client-ui-chat@0.2.2-rc.1，commit 66491b05e3
 *
 * 某些模型在思考流里夹带 `<signature>` 协议块，它不是给人看的。这里把整块
 * 连同其后的空行剥掉；若剥完什么都不剩，调用方必须整行不渲染，否则页面上
 * 会留下一个空白的思考行。
 */

/**
 * 把完整或流式的思考文本整理成可显示文本。
 * @param text - 原始的完整或流式思考。
 * @returns 可显示文本；没有可显示内容时返回空串。
 */
export function reasoningText(text: string): string {
  if (text[0] !== '<') return text
  const opening = '<signature>'
  // 流式初期只收到开标签的前缀：还不能判断要不要剥离，先按空内容处理。
  if (opening.startsWith(text)) return ''
  if (!text.startsWith(opening)) return text
  const closing = '</signature>'
  const end = text.indexOf(closing, opening.length)
  // 闭合标签还没到：整段仍是协议内容。
  if (end === -1) return ''
  let start = end + closing.length
  while (start < text.length) {
    if (text[start] === '\n') start++
    else if (text[start] === '\r' && text[start + 1] === '\n') start += 2
    else break
  }
  return text.slice(start)
}
