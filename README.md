# `Grapher`
## TODO 
### Next up
- [ ] Resizing the window ([see bugs](#bugs))
### Features
- Zoom / pan to origin on button click
    - Interpolation of resolution isn't working yet
- Drawing multiple lines
- Stretching and squashing of individual axes
    - [ ] Adjust aspect ratio (works for one axis, see shader code)
- Display numbers even when axes aren't in view (example [Desmos](https://www.desmos.com/calculator/hsocrbfms9))
- Zoom-in shouldn't zoom to exact mouse position, it should zoom to nearest point (round)
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
- Move away from having double definitions, like I do for the unfiorms. I have a variable storing the uniform value and an object inside the element object/bundle. Long term it will probably be better to have one single source of truth and it would also simplify the code. 
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
- Revise exact resolution calculation for stretch and squashing function. Current implementation probably isn't resilient enough
- `zoomToOrigin()` doesn't reset cleanly when axes are scaled, due to the `lineWidth` being instantly reset
- Zooming is capped at 1e-6 and 2e+18. These limits should probably be increased.
    - `roundToFractionOfStep()` needs a more robust implementation, it is the reason for having the zoom-in cap at 1e-6 
    - The precision variable used in `roundPoint()` and `minorGridPoints()` should be refactored


### Bugs
- The function `determineGridSize()` doesn't produce the same result as the following:
    ```JS
        const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
        const xRange = Math.abs(xMax - xMin)
        const yRange = Math.abs(yMax - yMin)

        const maxRange = Math.max(xRange, yRange)
        const gridSize =  calculateGridSize(maxRange)
    ```
- Resizing the window doesn't update the aspect ratio or something else
    - Using hardcoded value `startAspectRatio` for aspect ratio in line shader, needs to be a uniform 
- Not sure whether stretching is implemented correctly, when (0, 0) isn't the center of the camera there might be weird behaviour 
- `roundToFractionOfStep()` and `roundPoint()` produce rounding erros , observable in displayed mouse coordinates or number labels
    - when dealing with small numbers
    - when dealing with big numbers with fraction
    - when dealing with big numbers

## Miscellaneous 
### Potential for bugs
The rendering order is currently not really flexible, it would need some refactoring to make it more flexible. For instance, the current rendering process, wouldn't allow for such a rendering order: line segments > joins >line segments > joins ...

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
