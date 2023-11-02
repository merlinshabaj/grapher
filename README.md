### Bugs
- After reload zoom doesn't target the mouse position, unless the cursor is moved
- After zooming out far, zooming in doesn't display graph properly (resolution related)

### TODO
- fix worldToScreen() function

## Drawing numbers
I am currently rendering the numbers twice, this seems to be eliminating a bug. However this is probably a bad solution.
```JS
drawNumbers()
textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height)
drawNumbers()
```