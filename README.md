### TODO
- Arrow for axes

### Bugs
- zooming in and out still has limits that aren't handled


## Drawing numbers
I am currently rendering the numbers twice, this seems to be eliminating a bug. However this is probably a bad solution.
```JS
drawNumbers()
textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height)
drawNumbers()
```