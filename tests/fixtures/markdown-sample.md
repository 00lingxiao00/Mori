# Markdown 编辑器测试

这是一段用于测试 Markdown 编辑器的示例文字。它包含常见语法：**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码` 和 [链接](https://example.com)。

## 二级标题

### 三级标题

> 这是一段引用。
>
> > 这是嵌套引用。

---

## 列表测试

### 无序列表

- 苹果
- 香蕉
  - 小香蕉
  - 大香蕉
- 橙子

### 有序列表

1. 第一项
2. 第二项
   1. 子项 A
   2. 子项 B
3. 第三项

### 任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [ ] 另一个未完成任务

## 代码测试

行内代码：`console.log("Hello, Markdown!")`

代码块：

```javascript
function hello(name) {
  console.log(`Hello, ${name}!`);
}

hello("Markdown");
```

```python
def add(a, b):
    return a + b

print(add(1, 2))
```

## 表格测试

| 功能 | 语法 | 状态 |
| :--- | :---: | ---: |
| 粗体 | `**文字**` | ✅ |
| 斜体 | `*文字*` | ✅ |
| 删除线 | `~~文字~~` | ✅ |
| 行内代码 | `` `code` `` | ✅ |

## 链接与图片

[OpenAI](https://openai.com)

![占位图](https://via.placeholder.com/120x60 "测试图片")

## 数学公式测试

行内公式：$E = mc^2$

块级公式：

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

## 脚注测试

这是一个脚注引用[^1]。

[^1]: 这是脚注内容。

## HTML 与转义测试

<kbd>Ctrl</kbd> + <kbd>S</kbd> 保存，<mark>高亮文本</mark>。

\*这段文字不会被解析为斜体\*

---

测试结束。
