# `Plotter`
## TODO 
### Features
- Zoom / pan to origin on button click
    - Interpolation of resolution isn't working yet
- Drawing multiple lines
- Stretching and squashing of individual axes
    - Squashing and dragging of the y-axis
    - Squash and stretch by dragging the repsective axis
    - Update resoltuion
    - Update line widths?
    - Handle zoom behavior when an axis is stretched or squashed
        - Update correctedScale uniform
        - handle line width
        - probably handle resolution

- Display numbers even when axes aren't in view (GeoGebra)
#### Soon
- Maybe label for axes (x and y)
- Arrows for axes



### Implementation 
- Probably need to migrate to rendering the numbers using WebGL, in order to be able to display them behind the graph. I don't think there is a way of having the canvas api respect my 3D hierachy in WebGL.
Possible approaches:
    1. Try to render numbers into textures using 2D canvas API and send the data to GPU on the fly
    2. Render set of numbers / symbols that are going to be displayed into textures and send them to the GPU 
    3. Create an atlas of all the symbols
- I want to move away from defining the variables representing the world dimension (`xMin`, `xMax`, `yMin`, `yMax`) as individual values and either move them together. I don't know how yet but time will tell, I shouldn't do that yet anyway.
- Move away from having double definitions, like I do for the unfiorms. I have a variable storing the uniform value and an object inside the element object/bundle. Long term it will probably be better to have one single source of truth and it would also simpliy the code. 
    - Define a default value for line widths and other globals, so this can be refactored
    ```JS
    const setLineWidthToDefault = () => {
                graphLineWidth = translationVector([3, 0]).screenToWorldSpace()[0]
                majorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
                minorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
                axesLineWidth = translationVector([2, 0]).screenToWorldSpace()[0]
                updateLineWidthOnUniforms()
            }
    ```

### Bugs
- Zooming in and out still has limits that aren't handled
- Zooming in too far makes minor grid disappear and also major grid when scrolled even further
- Zooming out too far and graph begins to flig. I assume this is due to the points be recalculated, this being the same bahviour as panning on a low resolution creates. Need to check calculation of resolution 
- The function `determinGridSize()` doesn't produce the same result as the following:
```JS
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const xRange = Math.abs(xMax - xMin)
    const yRange = Math.abs(yMax - yMin)

    const maxRange = Math.max(xRange, yRange)
    const gridSize =  calculateGridSize(maxRange)
```


## Miscellaneous 
### Potential for bugs
The rendering order is currently not really flexible, it would need some refactoring to make it more flexible. For instance, the current rendering process, wouldn't allow for such a rendering oder: line segments > joins >line segments > joins ...

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
