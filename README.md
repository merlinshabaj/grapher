## TODO 
### Features
- Arrows for axes
- Maybe label for axes (x and y)
- Drawing multiple lines

### Implementation 
- Get rid of 'duplicate' programs, meaning all programs that use the line vertex shader. I want to use only two programs (line segements, joins) for line rendering and merely give them different points to draw the lines from and to. ✅ 
    => Need to refactor new code: Loop over number of elements for each given `component` instead of having `let i = 0; i += 1;`. Additionally change name of `component` to something more fitting.
- Probably need to migrate to rendering the numbers using WebGL, in order to be able to display them behind the graph. I don't think there is a way of having the canvas api respect my 3D hierachy in WebGL.

### Bugs
- Zooming in and out still has limits that aren't handled
- Zooming in too far makes minor grid disappear and also major grid when scrolled even further
- Zooming out too far and graph begins to flig. I assume this is due to the points be recalculated, this being the same bahviour as panning on a low resolution creates. Need to check calculation of resolution 


## Miscellaneous 
### Drawing numbers
I am currently rendering the numbers twice, this seems to be eliminating a bug. However this is probably a bad solution.
```JS
const render = () => {
    .
    .
    .
    drawNumbers()
    textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height)
    drawNumbers()
}
```