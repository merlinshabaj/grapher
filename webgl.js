'use strict'

import * as webglUtils from './webgl-utils.js';
import { rangeInclusive, vsub, expect, vmul, vdiv, vadd, elementWithId, div, setProps, log, left, positionToStyle } from './utils.js';
import * as m4 from './m4.js';

const flipY = vec2 => [vec2[0], -1 * vec2[1]]
const canvasSize = () => [canvas.clientWidth, canvas.clientHeight]
const worldSize = () => [xMax - xMin, yMax - yMin]
const min = () => [xMin, yMin]
const max = () => [xMax, yMax]

const translationVector = vector => {
    // How many world space coordinates do we travel for one pixel? (this could also be a transformation matrix instead)
    const transformationVector = () => flipY(vdiv(worldSize(), canvasSize()))
    const screenToWorldSpace = () => vmul(vector, transformationVector())
    return { screenToWorldSpace }
}

const positionVector = vector => {
    const screenToClipSpace = vector => () => vadd(vmul(flipY(vdiv(vector, canvasSize())), 2), [-1, 1])
    const clipToScreenSpace = vector => () => vadd(vmul(flipY(vmul(vector, canvasSize())), 1), canvasSize())
    const clipToWorldSpace = vector => () => vadd(min(), vmul(vadd(vector, 1), 1/2, worldSize()))
    const worldToClipSpace = vector => () => vsub(vmul(vsub(vector, min()), vdiv([2,2], worldSize())), 1);
    const screenToWorldSpace = () => clipToWorldSpace(screenToClipSpace(vector)())()
    const worldToScreenSpace = () => clipToScreenSpace(worldToClipSpace(vector)())()

    return {
        screenToClipSpace: screenToClipSpace(vector),
        clipToScreenSpace: clipToScreenSpace(vector),
        clipToWorldSpace: clipToWorldSpace(vector),
        worldToClipSpace: worldToClipSpace(vector),
        screenToWorldSpace,
        worldToScreenSpace,
    }
}

const scaleCanvas = canvas => {
    const width = canvas.clientWidth * devicePixelRatio
    const height = canvas.clientHeight * devicePixelRatio
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

const lineVertexShaderSource = `#version 300 es
precision highp float;

in vec2 a_instanceVertexPosition;
in vec4 a_startAndEndPoints;

uniform mat4 u_mvp;
uniform float u_lineWidth;
uniform float u_correctedScale;

void main() {
    vec2 start = a_startAndEndPoints.xy; // start points
    vec2 end = a_startAndEndPoints.zw; // end points

    vec2 direction = end - start;
    vec2 unitNormal = normalize(vec2(-direction.y, direction.x));
    float startAspectRatio = 1.8274111675126903;
    float correctedScale = u_correctedScale / startAspectRatio;

    bool isVertical = abs(direction.x) == 0.0;
    bool isHorizontal = abs(direction.y) == 0.0;

    if (abs(direction.x) == 0.0) {
        unitNormal.x = unitNormal.x * correctedScale;
    } 
    
    // if (abs(direction.y) == 0.0) {
    //     unitNormal.y = unitNormal.y / correctedScale;
    // }

    vec2 worldSpacePosition = start + direction * a_instanceVertexPosition.x + unitNormal * u_lineWidth * a_instanceVertexPosition.y;
    gl_Position = u_mvp * vec4(worldSpacePosition, 0, 1);
}
`;

const roundJoinShaderSource = `#version 300 es
in vec2 a_instanceVertexPosition;
in vec4 a_startAndEndPoints;

uniform mat4 u_mvp;
uniform float u_lineWidth;
uniform float u_correctedScale;

void main() {
    vec2 startPoint = a_startAndEndPoints.xy;    
    
    vec2 offset = vec2(a_instanceVertexPosition.x * u_correctedScale, a_instanceVertexPosition.y);
    vec2 point = u_lineWidth * offset + startPoint;
    
    gl_Position = u_mvp * vec4(point, 0, 1);
}
`;


const fragmentShaderSource = `#version 300 es

// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

uniform vec4 u_color;

out vec4 outColor;

void main() {
    outColor = u_color;
}
`;

const functions = [
    x => Math.cos(x),
    x => Math.sin(x),
    x => x,
    x => x * x,
    x => x * x * x,
    x => Math.log1p(x),
    x => Math.cos(x) / 0.2,
    x => Math.cos(x / 2 ),
];

const colors = () => {
    const grayscale = (value, alpha) => [value, value, value, alpha ?? 1.0]
    const graphColor = grayscale(0.25, 1.0)
    const majorGridColor = grayscale(0.75);
    const minorGridColor = grayscale(0.9);
    const axesColor = grayscale(0.5);
    return { graphColor, majorGridColor, minorGridColor, axesColor }
}

const main = () => {
    const setupEventListeners = () => {
        const updateAllPoints = () => {
            graphPointsBuffer.updateData(graphPoints())
            majorGridPointsBuffer.updateData(majorGridPoints())
            minorGridPointsBuffer.updateData(minorGridPoints())
            axesPointsBuffer.updateData(axesPoints())
        }
        const updateLineWidthOnUniforms = () => {
            graph.updateWidth(graphLineWidth)
            majorGrid.updateWidth(majorGridLineWidth)
            minorGrid.updateWidth(minorGridLineWidth)
            axes.updateWidth(axesLineWidth)
        }
        const renderWithNewOrthographicDimensions = (newGridSize = null) => {
            const updateGridSizes = () => {
                [gridSizeX, gridSizeY] = determineGridSize();
            }
            computeViewProjectionMatrix()
            if (newGridSize) { 
                gridSizeX = newGridSize
                gridSizeY = newGridSize
            } else { 
                updateGridSizes()
            }
            updateAllPoints()
            render();
        }
        const setCursorStyle = style => {
            canvas.style.cursor = style;
        }
        const cursorStyle = (mousePosition, defaultCursor) => {
            return mousePosition.every(position => position === 0) ? 'col-resize'
            : mousePosition.findIndex((position) => position === 0) === 0 ? 'row-resize' 
            : mousePosition.findIndex((position) => position === 0) === 1 ? 'col-resize'
            : defaultCursor
        } 
        const mousePositionWorld = mousePositionScreen => {
            const roundToFractionOfStep = (value, step) => {
                const fraction = step / 10
                const roundedValue =  Math.round(value / fraction) * fraction
                const decimalPlaces = (step.toString().split('.')[1] || '').length + 1
                return Number.parseFloat(roundedValue.toFixed(decimalPlaces))
            }
            let _mousePositionWorld = vsub(positionVector(mousePositionScreen).screenToWorldSpace(), [translation[0], translation[1]])
            _mousePositionWorld[0] = roundToFractionOfStep(_mousePositionWorld[0], gridSizeX)
            _mousePositionWorld[1] = roundToFractionOfStep(_mousePositionWorld[1], gridSizeY)
            return _mousePositionWorld
        }
        const calculateMaxRangeGridSize = () => {
            const maxRange = Math.max(xMax - xMin, yMax - yMin)
            return calculateGridSize(maxRange)
        }
        const zoom = event => {
            const zoom = (zoomingIn, mousePosition) => {
                // Limit zooom in and zoom out
                if (calculateMaxRangeGridSize() <= 1e-6 && zoomingIn || calculateMaxRangeGridSize() >= 2e+18 && !zoomingIn) { return }
                const adjustedZoomFactor = zoomingIn ? zoomFactor : 1 / zoomFactor
                const recalculate = something => something / adjustedZoomFactor
                const updateLineWidths = () => {
                    const updateLineWidths = () => {
                        const recalculateEach = somethings => somethings.map(recalculate);
                        [graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth] = recalculateEach([graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth])
                    }
                 
                    updateLineWidths()
                    updateLineWidthOnUniforms()
                }
                const updateResolution = () => resolution = 1 / recalculate(1 / resolution)
                const updateWorldMinAndMax = () => {
                    const recalculateWorldMinAndMax = () => {
                        const mousePositionWorld = positionVector(mousePosition).screenToWorldSpace()
                        const minNew = vsub(mousePositionWorld, vdiv(vsub(mousePositionWorld, min()), adjustedZoomFactor))
                        const maxNew = vadd(mousePositionWorld, vdiv(vsub(max(), mousePositionWorld), adjustedZoomFactor))
                        return [minNew, maxNew]
                    }
    
                    const [minNew, maxNew] = recalculateWorldMinAndMax();
                    [xMin, yMin] = minNew;
                    [xMax, yMax] = maxNew;
                }
                
                updateLineWidths()
                updateResolution()
                updateWorldMinAndMax()
               
                const newGridSize = calculateMaxRangeGridSize()
                correctedScale === aspectRatio ? renderWithNewOrthographicDimensions(newGridSize) : renderWithNewOrthographicDimensions()
            }
            const mousePositionRelativeToCanvas = () => {
                const rect = canvas.getBoundingClientRect()
                const rectOrigin = [rect.left, rect.top]
                const mousePosition = [event.clientX, event.clientY]
                return vsub(mousePosition, rectOrigin)
            }
            const _mousePositionRelativeToCanvas = mousePositionRelativeToCanvas()
            // Determine zoom direction
            if (event.deltaY === 0) return
            zoom(event.deltaY < 0, _mousePositionRelativeToCanvas)
        }
        const pan = event => {
            if (!panningPosition) return
            const mousePosition = [event.clientX, event.clientY]

            const updateTranslation = () => {
                const deltaScreen = vsub(mousePosition, panningPosition)
                const deltaWorld = translationVector(deltaScreen).screenToWorldSpace()

                const newTranslation = vadd(translation.slice(0, -1), deltaWorld)
                translation[0] = newTranslation[0]
                translation[1] = newTranslation[1]    
            }
            updateTranslation()
            
            panningPosition = mousePosition
            
            updateAllPoints()
            render();
        }
        const scaleAxes = event => {
            const scaleAxes = () => {
                const updateScale = (axis, scaleFactor, resolutionFactor) => {
                    const updateCorrectedScale = () => {
                        const updateCorrectedScaleOnUniforms = correctedScale => {
                            graph.updateCorrectedScale(correctedScale)
                            majorGrid.updateCorrectedScale(correctedScale)
                            minorGrid.updateCorrectedScale(correctedScale)
                            axes.updateCorrectedScale(correctedScale)
                        }
                        const calculateXScale = () => {
                            const xRange = xMax - xMin
                            const yRange = yMax - yMin
                            const xScale = xRange / yRange
                            return xScale
                        }
        
                        const _correctedScale = calculateXScale()
                        correctedScale = _correctedScale
                        updateCorrectedScaleOnUniforms(correctedScale)
                    }
                    const updateResolution = resolutionFactor => resolution = resolution / resolutionFactor

                    if (axis === 'x') {
                        xMin = xMin * scaleFactor
                        xMax = xMax * scaleFactor
                    } else if (axis === 'y') {
                        yMin = yMin * scaleFactor
                        yMax = yMax * scaleFactor
                    }
                    updateCorrectedScale()
                    updateResolution(resolutionFactor)
                    renderWithNewOrthographicDimensions()
                }
                const squashX = (scaleFactor, resolutionFactor) => updateScale('x', scaleFactor, resolutionFactor)
                const stretchX = (scaleFactor, resolutionFactor) => updateScale('x', scaleFactor, resolutionFactor)
                const squashY = (scaleFactor, resolutionFactor) => updateScale('y', scaleFactor, resolutionFactor)
                const stretchY = (scaleFactor, resolutionFactor) => updateScale('y', scaleFactor, resolutionFactor)
                const createAxisHandler = (axisIndex, squashFunc, stretchFunc) => {
                    if (isMouseDown && startMouse[axisIndex] !== null) {
                        const currentMouse = axisIndex === 0 ? event.clientX : event.clientY
                        if (currentMouse > startMouse[axisIndex]) {
                            squashFunc(scaleFactor, resolutionFactor)
                        } else if (currentMouse < startMouse[axisIndex]) {
                            stretchFunc((1 / scaleFactor), (1 / resolutionFactor))
                        }
                        startMouse[axisIndex] = currentMouse
                    }
                }

                createAxisHandler(0, squashX, stretchX)
                createAxisHandler(1, squashY, stretchY)
            }
            

            const scaleFactor = 1.05
            const resolutionFactor = 1.025
            scaleAxes()
        }
        const changeCursorStyle = event => {
            const mousePositionScreen = [event.clientX, event.clientY]
            const _mousePositionWorld = mousePositionWorld(mousePositionScreen)
            const mousePositionWorldHasZero = _mousePositionWorld.some(position => position === 0)
        
            if (!isMouseDown || isMouseDown && mousePositionWorldHasZero) {
                const _cursorStyle = cursorStyle(_mousePositionWorld, 'grab')
                setCursorStyle(_cursorStyle)
            }
        }
        const startPanningOrScaling = event => {
            isMouseDown = true
            const mousePosition = [event.clientX, event.clientY]
            panningPosition = mousePosition
            const _mousePositionWorld = mousePositionWorld(mousePosition)
            const mousePositionWorldHasZero = _mousePositionWorld.some(position => position === 0)
            if (mousePositionWorldHasZero) {
                _mousePositionWorld[1] === 0 ? startMouse[0] = event.clientX : startMouse[1] = event.clientY
                const _cursorStyle = cursorStyle(_mousePositionWorld, 'grabbing')
                setCursorStyle(_cursorStyle)
                canvas.addEventListener('mousemove', scaleAxes)
            } else {
                setCursorStyle('grabbing')
                canvas.addEventListener('mousemove', pan)
            }
        }
        const stopPanningAndScaling = () => {
            isMouseDown = false
            panningPosition = null
            startMouse = [null, null]
            canvas.removeEventListener('mousemove', pan)
            canvas.removeEventListener('mousemove', scaleAxes)
        }
        const zoomToOrigin = () => {
            const animateZoom = () => {
                const easeInOutCubic = t => {
                    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                }
                const interpolateArray = (currentArray, targetArray, fraction) => {
                    return currentArray.map((current, index) => {
                        return current + fraction * (targetArray[index] - current)
                    });
                }
                const interpolateNumber = (currentNumber, targetNumber, fraction) => {
                    return currentNumber + fraction * (targetNumber - currentNumber)
                }
                const setWorldDimensions = dimensions => {
                    [xMin, xMax, yMin, yMax] = dimensions
                }
                const setLineWidthToDefault = () => {
                    graphLineWidth = translationVector([3, 0]).screenToWorldSpace()[0]
                    majorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
                    minorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
                    axesLineWidth = translationVector([2, 0]).screenToWorldSpace()[0]
                    updateLineWidthOnUniforms()
                }
                const setScalingToAspectRatio = () => {
                    const updateCorrectedScaleOnUniforms = () => {
                        graph.updateCorrectedScale(correctedScale)
                        majorGrid.updateCorrectedScale(correctedScale)
                        minorGrid.updateCorrectedScale(correctedScale)
                        axes.updateCorrectedScale(correctedScale)
                    }
                    correctedScale = aspectRatio
                    updateCorrectedScaleOnUniforms()
                }
                /** Updates translation, resolution and world dimensions */
                const interpolateToDefaultValues = () => {
                    const targetDimensions = [-5 * aspectRatio, 5 * aspectRatio, -5, 5]
                    setWorldDimensions(interpolateArray([xMin, xMax, yMin, yMax], targetDimensions, fraction))
                    translation = interpolateArray(translation, [0,0,0], fraction)
                    resolution = interpolateNumber(resolution, 100, fraction)
                }
                const animationDuration = 500
                let elapsedTime = Date.now() - startTime
                let fraction = elapsedTime / animationDuration
                if (fraction > 1) fraction = 1
                fraction = easeInOutCubic(Math.max(0, Math.min(1, fraction)))

                interpolateToDefaultValues()
                setScalingToAspectRatio()
                setLineWidthToDefault()

                const newGridSize = calculateMaxRangeGridSize()
                renderWithNewOrthographicDimensions(newGridSize)

                if (fraction < 1) {
                    requestAnimationFrame(animateZoom); // Continue the animation
                }
            }
            const startTime = Date.now()
            requestAnimationFrame(animateZoom)
        }
        const showMouseCoordinates = event => {
            const positionDiv = mousePositionScreen => {
                const mouseCoordinates = document.querySelector(".mouse-coordinates")
                const mouseDivOffset = 15
                mouseCoordinates.style.left = mousePositionScreen[0] + mouseDivOffset + 'px'
                mouseCoordinates.style.top = mousePositionScreen[1] - mouseDivOffset + 'px'
                return mouseCoordinates
            }
            const mousePositionScreen = [event.clientX, event.clientY]
            const mouseCoordinates = positionDiv(mousePositionScreen)
            const _mousePositionWorld = mousePositionWorld(mousePositionScreen)

            mouseCoordinates.innerHTML = `(${_mousePositionWorld[0]}, ${_mousePositionWorld[1]})`
        }
        let panningPosition = null
        let startMouse = [null, null]
        let isMouseDown = false
        canvas.addEventListener('mousemove', changeCursorStyle)
        canvas.addEventListener('mousedown', startPanningOrScaling)
        canvas.addEventListener('mouseup', () => {
            stopPanningAndScaling()
            setCursorStyle('grab')
        });
        canvas.addEventListener('mouseleave', () => {
            stopPanningAndScaling()
            setCursorStyle('default')
        });
        canvas.addEventListener('mouseenter', () => setCursorStyle('grab'))
        canvas.addEventListener('wheel', zoom)
        // Prevent the page from scrolling when using the mouse wheel on the canvas
        canvas.addEventListener('wheel', event => event.preventDefault(), { passive: false })
        const homeButton = document.querySelector('.home-button__container')
        homeButton.addEventListener('click', zoomToOrigin)
        canvas.addEventListener('mousemove', showMouseCoordinates)
    }
    
    const render = () => {
        const drawElements = object => {
            const useObjectProgram = () => gl.useProgram(object.programInfo.program)
            const setUniforms = (mvp, color, lineWidth, correctedScale) => {
                gl.uniformMatrix4fv(object.programInfo.mvpLocation, false, mvp)
                gl.uniform4fv(object.programInfo.colorLocation, color)
                gl.uniform1f(object.programInfo.lineWidthLocation, lineWidth)
                gl.uniform1f(object.programInfo.correctedScaleLocation, correctedScale)
            }
            const bindVertexArray = () => gl.bindVertexArray(object.vertexArray)
            const draw = () => {
                const drawArraysInstanced = (instanceCount) => gl.drawArraysInstanced(primitiveType, offset, verticesPerInstance, instanceCount)
                // const drawArrays = () => gl.drawArrays(primitiveType, offset, verticesPerInstance)
                
                const primitiveType = object.primitiveType
                const offset = 0
                const verticesPerInstance = object.count
                let instanceCount

                object.elements().forEach( element => {
                    const buffer = element.buffer
                    const _uniform = element.uniforms()
                    setUniforms(_uniform.u_mvp, _uniform.u_color, _uniform.u_lineWidth, _uniform.u_correctedScale)
                    buffer.bind()
                    setupStartAndEndPoints(startAndEndPoints)
                    instanceCount = buffer.length() / 4 

                    drawArraysInstanced(instanceCount)
                })
            }

            useObjectProgram()
            bindVertexArray()
            draw()
        }
        const setupRenderingContext = () => {
            textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height)
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            // gl.enable(gl.DEPTH_TEST);
        }
        const updateMVPMatrices = () => {
            mvpMatrix = computeMVPMatrix(viewProjectionMatrix, translation, 0, 0, scale);
            graph.updateMVPMatrix(mvpMatrix)
            majorGrid.updateMVPMatrix(mvpMatrix)
            minorGrid.updateMVPMatrix(mvpMatrix)
            axes.updateMVPMatrix(mvpMatrix)
        }
        const drawEachElement = () => renderers.forEach(drawElements)

        const drawNumbers = () => {
            const worldToScreen = worldPoint => {
                const clipPosition = m4.transformVector(mvpMatrix, [worldPoint[0], worldPoint[1], 0, 1])
                const textPos = positionVector(clipPosition).clipToScreenSpace()

                return textPos
            }
            const textDimensions = (text) => {
                const _textMetrics = textContext.measureText(String(text).replace('-', '−'))
                const textWidth = _textMetrics.width
                const textHeight = _textMetrics.actualBoundingBoxAscent + _textMetrics.actualBoundingBoxDescent

                return [textWidth, textHeight]
            }
            const drawNumber = (number, position) => {
                const drawStroke = () => {
                    textContext.strokeStyle = 'white'
                    textContext.lineWidth = 16;
                    textContext.strokeText(String(number).replace('-', '−'), position[0], position[1])
                }
                const _drawNumber = () => {
                    textContext.fillStyle = 'black'
                    textContext.fillText(String(number).replace('-', '−'), position[0], position[1])
                }
                textContext.font = '56px KaTeX_Main'
                drawStroke()
                _drawNumber() 
            }
            const roundPoint = point => {
                const precision = 10000000000000 // 1e-13
                point[0] = Math.round(point[0] * precision) / precision
                point[1] = Math.round(point[1] * precision) / precision
            
                return point
            }

            const numberAxisOffset = 28 // half of font size?

            numberPointsXAxis().forEach(worldPoint => {
                worldPoint = roundPoint(worldPoint)
                if (worldPoint[0] === 0 && worldPoint[1] === 0) { return }
                const offsetAndCalculateNumberPosition = (width, height) => {
                    const offset = [width / -2, height + numberAxisOffset]
                    const numberPosition = vadd(worldToScreen(worldPoint), offset)
                    
                    return numberPosition
                }

                const numberDimensions = textDimensions(worldPoint[0])
                const numberPosition = offsetAndCalculateNumberPosition(numberDimensions[0], numberDimensions[1])
                drawNumber(worldPoint[0], numberPosition)
            })

            numberPointsYAxis().forEach(worldPoint => {
                worldPoint = roundPoint(worldPoint)
                if (worldPoint[0] === 0 && worldPoint[1] === 0) { return }
                const offsetAndCalculateNumberPosition = (width, height) => {
                    const offset = [-width - numberAxisOffset, height / 2]
                    const numberPosition = vadd(worldToScreen(worldPoint), offset)
                    
                    return numberPosition
                }

                const numberDimensions = textDimensions(worldPoint[1])
                const numberPosition = offsetAndCalculateNumberPosition(numberDimensions[0], numberDimensions[1])
                drawNumber(worldPoint[1], numberPosition)
            })
        }

        scaleCanvas(canvas)
        scaleCanvas(textCanvas)
        setupRenderingContext()
        updateMVPMatrices()
        drawEachElement()  

        drawNumbers()
        textContext.clearRect(0, 0, textContext.canvas.width, textContext.canvas.height)
        drawNumbers()
    }
    const attribLocations = program => ['a_instanceVertexPosition', 'a_startAndEndPoints'].map(name => gl.getAttribLocation(program, name))
    const createProgramFunctions = () => {
        const createProgram = ({ vertexShaderSource, fragmentShaderSource }) => {
            const shaders = [
                webglUtils.loadShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
                webglUtils.loadShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER),
            ]
            const program = webglUtils.createProgram(gl, shaders);
            return program
        }
        const lineProgram = createProgram({ vertexShaderSource: lineVertexShaderSource, fragmentShaderSource: fragmentShaderSource })
        const roundJoinProgram = createProgram({ vertexShaderSource: roundJoinShaderSource,  fragmentShaderSource: fragmentShaderSource })

        return {
            lineProgram, 
            roundJoinProgram,
        }
    }
    const computeViewProjectionMatrix = () => {
        const viewMatrix = () => {
            const cameraPosition = [0, 0, 1];
            const target = [0, 0, 0];
            const up = [0, 1, 0];
        
            const cameraMatrix = m4.lookAt(cameraPosition, target, up);
            return m4.inverse(cameraMatrix);
        }

        const orthographicMatrix = m4.orthographic(xMin, xMax, yMin, yMax, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix());    
    }
    const buffers = () => {
        const buffer = initialData => {
            const bindArrayBuffer = buffer => gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            const createBufferWithData = data => {
                const buffer = gl.createBuffer()
                uploadBufferData(buffer, data)
                return buffer
            }
            const uploadBufferData = (buffer, data) => {
                bindArrayBuffer(buffer)
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW)
            }
    
            let _length = initialData.length
            const buffer = createBufferWithData(initialData)
            const updateData = newData => {
                _length = newData.length
                uploadBufferData(buffer, newData)
            }
            const length = () => _length
            const bind = () => bindArrayBuffer(buffer)
    
            return {
                buffer,
                length,
                updateData,
                bind,
            }
        }

        const lineSegmentBuffer = buffer(lineSegmentInstanceGeometry)
        const roundJoinGeometryBuffer = buffer(computeRoundJoinGeometry())
        
        const graphPointsBuffer = buffer(graphPoints())
        const majorGridPointsBuffer = buffer(majorGridPoints())
        const minorGridPointsBuffer = buffer(minorGridPoints())
        const axesPointsBuffer = buffer(axesPoints())

        return {
            lineSegmentBuffer,
            graphPointsBuffer,

            roundJoinGeometryBuffer,
            majorGridPointsBuffer,
            minorGridPointsBuffer,
            axesPointsBuffer,
        }
    }
    const {
        lineProgram, 
        roundJoinProgram,
    } = createProgramFunctions()
    const [
        ,
        startAndEndPoints,
    ] = attribLocations(lineProgram)
    const setupStartAndEndPoints = location => {
        gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 1);
    }
    const renderer = ({
        program,
        instanceVertexPositionBuffer,
        primitiveType,
    }) => {
        const setupVAO = (program, instanceVertexPositionBuffer) => {
            const [
                instanceVertexPosition,
                ,
            ] = attribLocations(program)
            const vao = createAndBindVAO()
            instanceVertexPositionBuffer.bind()
            setupInstanceVertexPosition(instanceVertexPosition)
            return vao
        }
        const createAndBindVAO = () => {
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);    
            return vao
        }
        const setupInstanceVertexPosition = location => {
            gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribDivisor(location, 0);    
        }
        const programInfo = (program) => {
            const getUniformLocation = name => gl.getUniformLocation(program, name)
            const mvpLocation = getUniformLocation('u_mvp')
            const colorLocation = getUniformLocation('u_color')
            const lineWidthLocation = getUniformLocation('u_lineWidth')
            const correctedScaleLocation = getUniformLocation('u_correctedScale')
            
            return {
                program,
                colorLocation,
                mvpLocation,
                lineWidthLocation,
                correctedScaleLocation,
            }
        }

        let _elements = []
        
        const vao = setupVAO(program, instanceVertexPositionBuffer)
        const _programInfo = programInfo(program)
        const getElements = () => _elements
        const addElements = elements => {
            _elements = _elements.concat(elements);
        }
        return {
            programInfo: _programInfo,
            vertexArray: vao,
            primitiveType,
            count: instanceVertexPositionBuffer.length() / 2,
            elements: getElements,
            addElements,
        }
    }
    const element = ({ 
        buffer, 
        color, 
        lineWidth,
        correctedScale,
    }) => {
        const uniforms = ({ color, lineWidth, correctedScale}) => ({
            u_color: color, 
            u_mvp: m4.identity(),
            u_lineWidth: lineWidth, 
            u_correctedScale: correctedScale,
        })

        let _buffer = buffer
        
        const _uniforms = uniforms({ color, lineWidth, correctedScale})
        const updateMVPMatrix = mvp => _uniforms.u_mvp = mvp
        const updateWidth = width => _uniforms.u_lineWidth = width
        const updateCorrectedScale = correctedScale => _uniforms.u_correctedScale = correctedScale
        return {
            buffer: _buffer,
            uniforms: () => _uniforms,
            updateMVPMatrix,
            updateWidth,
            updateCorrectedScale,
        }
    }



    const lineSegmentInstanceGeometry = [
        0, -0.5,
        1, -0.5,
        1, 0.5,
        0, -0.5,
        1, 0.5,
        0, 0.5
    ]

    const {
        lineSegmentBuffer,
        roundJoinGeometryBuffer,

        graphPointsBuffer,
        majorGridPointsBuffer,
        minorGridPointsBuffer,
        axesPointsBuffer,
    } = buffers()

    const graph = element({buffer: graphPointsBuffer, color: graphColor, lineWidth: graphLineWidth, correctedScale: correctedScale})
    const majorGrid = element({buffer: majorGridPointsBuffer, color: majorGridColor, lineWidth: majorGridLineWidth, correctedScale: correctedScale})
    const minorGrid = element({buffer: minorGridPointsBuffer, color: minorGridColor, lineWidth: minorGridLineWidth, correctedScale: correctedScale})
    const axes = element({buffer: axesPointsBuffer, color: axesColor, lineWidth: axesLineWidth, correctedScale: correctedScale})

    const line = renderer({
        program: lineProgram,
        instanceVertexPositionBuffer: lineSegmentBuffer,
        primitiveType: gl.TRIANGLES,
    })
    const roundJoin = renderer({
        program: roundJoinProgram,
        instanceVertexPositionBuffer: roundJoinGeometryBuffer,
        primitiveType: gl.TRIANGLE_STRIP,
    })

    line.addElements([minorGrid, majorGrid, axes, graph])
    roundJoin.addElements([graph])

    let viewProjectionMatrix, mvpMatrix

    const renderers = [line, roundJoin]
    
    setupEventListeners()
    computeViewProjectionMatrix()
    render();
}

const computeMVPMatrix = (viewProjectionMatrix, translation, xRotation, yRotation, scale) => {
    let matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    matrix = m4.yRotate(matrix, yRotation);
    matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
    return matrix;
}

const graphPoints = () => {
    const [xMin, xMax,,] = translatedAxisRanges()
    const startX = xMin * resolution;
    const endX = xMax * resolution;

    const values = xStep => {
        const x = xStep / resolution;
        const y = currentFn(x);
        return [x, y, x, y];
    }

    const points = rangeInclusive(startX, endX).flatMap(values).slice(2, -2)

    return points
}

const computeRoundJoinGeometry = () => {
    resolution = 100
    const points = [];
    for (let i = 0; i < resolution; i++) {
        const theta0 = (2.0 * Math.PI * i) / resolution;
        const theta1 = (2.0 * Math.PI * i + 1.0) / resolution;

        points.push(0.5 * Math.cos(theta0), 0.5 * Math.sin(theta0));
        points.push(0, 0);
        points.push(0.5 * Math.cos(theta1), 0.5 * Math.sin(theta1));
    }

    return points
}

const determineMinBasedOnGridSize = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    // const xRange = Math.abs(xMax - xMin)
    // const yRange = Math.abs(yMax - yMin)

    // const maxRange = Math.max(xRange, yRange)
    // const gridSizeX = calculateGridSize(xRange)
    // const gridSizeY = calculateGridSize(yRange)

    // Min based on grid size
    const xStart = Math.ceil(xMin / gridSizeX) * gridSizeX;
    const yStart = Math.ceil(yMin / gridSizeY) * gridSizeY;

    return [xStart, yStart/*,  gridSizeX, gridSizeY */]
}

const majorGridPoints = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const points = [];

    const [xStart, yStart/* , gridSizeX, gridSizeY */] = determineMinBasedOnGridSize()

    for (let x = xStart; x <= xMax; x += gridSizeX) {
        points.push(x, yMax, x, yMin);
    }

    for (let y = yStart; y <= yMax; y += gridSizeY) {
        points.push(xMin, y, xMax, y);
    }

    return points
}

const minorGridPoints = () => {
    const points = [];
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const xRange = Math.abs(xMax - xMin)
    const yRange = Math.abs(yMax - yMin)

    const maxRange = Math.max(xRange, yRange)

    // const [gridSizeX, gridSizeY] = determineGridSize()

    const minorGridSizeX = gridSizeX / 5; // 5 minor lines between major lines
    const minorGridSizeY = gridSizeY / 5; // 5 minor lines between major lines

    const xStart = Math.ceil(xMin / minorGridSizeX) * minorGridSizeX;
    const yStart = Math.ceil(yMin / minorGridSizeY) * minorGridSizeY;

    const precision = 0.000000000000001 
    for (let x = xStart; x <= xMax; x += minorGridSizeX) {
        // Skip major grid lines
        if (Math.abs(x % gridSizeX) > precision) { 
            points.push(x, yMax, x, yMin);
        }
    }

    for (let y = yStart; y <= yMax; y += minorGridSizeY) {
        // Skip major grid lines
        if (Math.abs(y % gridSizeY) > precision) { 
            points.push(xMin, y, xMax, y);
        }
    }

    return points;
}

const axesPoints = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const points = [];

    points.push(xMin, 0, xMax, 0)
    points.push(0, yMin, 0, yMax)

    return points
}

const numberPointsXAxis = () => {
    const [,xMax,,] = translatedAxisRanges()
    let points = [];
    const [xStart,] = determineMinBasedOnGridSize()
    for (let x = xStart; x <= xMax; x += gridSizeX) {
        points.push([x, 0]);
    }
    
    return points
}

const numberPointsYAxis = () => {
    const [,,,yMax] = translatedAxisRanges()
    let points = [];
    const [,yStart] = determineMinBasedOnGridSize()

    for (let y = yStart; y <= yMax; y += gridSizeY) {
        points.push([0, y]);
    }

    return points
}

const calculateGridSize = range => {
    const orderOfMagnitude = Math.floor(Math.log10(range));

    let gridSize = Math.pow(10, orderOfMagnitude);
    const rangeGridMultiple = range / gridSize;

    const threshold = 0.5

    if (rangeGridMultiple < 5 * threshold) {
        gridSize /= 5
    } else if (rangeGridMultiple < 10 * threshold) {
        gridSize /= 2
    }
    return gridSize
}
const determineGridSize = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const xRange = Math.abs(xMax - xMin)
    const yRange = Math.abs(yMax - yMin)

    // const maxRange = Math.max(xRange, yRange)
    const gridSizeX = calculateGridSize(xRange)
    const gridSizeY = calculateGridSize(yRange)
    return [gridSizeX, gridSizeY]
}

const translatedAxisRanges = () => [xMin - translation[0], xMax - translation[0], yMin - translation[1], yMax - translation[1]]

const initializeGlobalVariables = () => {
    canvas = elementWithId('webgl');
    gl = expect(canvas.getContext('webgl2', { antialias: true }), 'could not get webgl2 context');
    textCanvas = elementWithId('text2dCanvas')
    textContext = textCanvas.getContext('2d')
    near = 0;
    far = 2;

    aspectRatio = canvas.clientWidth / canvas.clientHeight;
    console.log('aspectRatio: ', aspectRatio);

    [xMin, xMax] = (() => {
        return [-5 * aspectRatio, 5 * aspectRatio]
    })()
    yMin = -5;
    yMax = 5;
    translation = [0, 0, 0];

    correctedScale = (() => {
        const xRange = xMax - xMin
        const yRange = yMax - yMin
        const xScale = xRange / yRange
        return xScale
    })();


    [gridSizeX, gridSizeY] = (() => {
        return determineGridSize()
    })();
    scale = [1, 1, 1];
    resolution = 100 /* 250 */;
    currentFn = functions[2];

    graphLineWidth = translationVector([3, 0]).screenToWorldSpace()[0]
    majorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
    minorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0]
    axesLineWidth = translationVector([2, 0]).screenToWorldSpace()[0]
}

/** @type {HTMLCanvasElement} */
let canvas
/** @type {WebGL2RenderingContext} */
let gl
/** @type {HTMLCanvasElement}*/
let textCanvas
/** @type {CanvasRenderingContext2D} */
let textContext
let near, far, xMin, xMax, yMin, yMax, translation, scale, resolution, currentFn, correctedScale
let graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth
let gridSizeX, gridSizeY
let aspectRatio
const zoomFactor = 1.05;
const { graphColor, majorGridColor, minorGridColor, axesColor } = colors()
initializeGlobalVariables()
main();