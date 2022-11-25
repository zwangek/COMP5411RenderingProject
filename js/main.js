let renderer;
let scene, camera;
let uniforms = {};
let vertexShader, fragmentShader;
let stats;
let gui;
let guiControls;
let mouseControl = true;
let cameraFlightSpeed = 5;
let cameraRotationSpeed = 0.5;
let fovScale;
let clock;
let frameTime;

let pointerlockChange;
let cameraControls;
let cameraDirectionVector = new THREE.Vector3();
let cameraRightVector = new THREE.Vector3();
let cameraUpVector = new THREE.Vector3();
let cameraWorldQuaternion = new THREE.Quaternion();
let cameraControlsObject;

let ableToEngagePointerLock = true;
let isPaused = false;

let KeyboardState = {
	KeyA: false, KeyB: false, KeyC: false, KeyD: false, KeyE: false, KeyF: false, KeyG: false, KeyH: false, KeyI: false, KeyJ: false, KeyK: false, KeyL: false, KeyM: false,
	KeyN: false, KeyO: false, KeyP: false, KeyQ: false, KeyR: false, KeyS: false, KeyT: false, KeyU: false, KeyV: false, KeyW: false, KeyX: false, KeyY: false, KeyZ: false,
	ArrowLeft: false, ArrowUp: false, ArrowRight: false, ArrowDown: false, Space: false, Enter: false, PageUp: false, PageDown: false, Tab: false,
	Minus: false, Equal: false, BracketLeft: false, BracketRight: false, Semicolon: false, Quote: false, Backquote: false,
	Comma: false, Period: false, ShiftLeft: false, ShiftRight: false, Slash: false, Backslash: false, Backspace: false,
	Digit1: false, Digit2: false, Digit3: false, Digit4: false, Digit5: false, Digit6: false, Digit7: false, Digit8: false, Digit9: false, Digit0: false
};

function onKeyDown(event) {
    event.preventDefault();
    KeyboardState[event.code] = true;
}

function onKeyUp(event) {
    event.preventDefault();
    KeyboardState[event.code] = false;
}

function keyPressed(keyName) {
    return KeyboardState[keyName];
} 

function main() {
    initGUI();
    initBasics();
    initRayTracing();
    // animate();
    window.alert("success");
    animate();
}

function initGUI() {
    guiControls = new function() {
        this.spp = 100;
        this.maxRecursion = 25;
        this.ir = 1.3;
        this.epsilon = 0.001;
        this.skyIntensity = 1.0;
        this.sunIntensity = 0.0;
    };
    gui = new dat.GUI();

    var rayTracing = gui.addFolder('Ray Tracing');
    rayTracing.add(guiControls, 'spp', 1, 1000).step(1).name("Sample Per Pixel");
    rayTracing.add(guiControls, 'maxRecursion', 1, 50).step(1).name("Recursion Depth");
    rayTracing.add(guiControls, 'epsilon', 0.0, 2.0).name("Epsilon");

    var material = gui.addFolder('Material');
    material.add(guiControls, 'ir', 0.0, 2.0).name("Index of Refraction");
    material.add(guiControls, 'skyIntensity', 0.0, 1.0).name("Sky Intensity");
    material.add(guiControls, 'sunIntensity', -10.0, 10.0).name("Sun Intensity");
}

function initRayTracing() {
    uniforms = {
        cameraMatrix: {value: new THREE.Matrix4()},
        resolution: {value: new THREE.Vector2(window.innerWidth, window.innerHeight)},
        spp: {value: guiControls.spp},
        canvasU: {value: Math.tan(fovScale)},
        canvasV: {value: Math.tan(fovScale) * window.innerHeight/window.innerWidth},
        MAX_RECURSION: {value: guiControls.maxRecursion},
        randVec2: {value: new THREE.Vector2(Math.random(), Math.random())},
        INDEX_OF_REFRACTION: {value: guiControls.ir},
        MIN_EPS: {value: guiControls.epsilon},
        SKY_INTENSITY: {value: guiControls.skyIntensity},
        SUN_INTENSITY: {value: guiControls.sunIntensity}
    }
    const canvasGeo = new THREE.PlaneGeometry(2,2);
    const canvasMat = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    scene.add(canvasMesh);
    camera.add(canvasMesh);
}

function initBasics() {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
    scene.add(camera);

    stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	stats.domElement.style.cursor = "default";
	stats.domElement.style.userSelect = "none";
	stats.domElement.style.MozUserSelect = "none";
	document.body.appendChild(stats.domElement);

    fovScale = camera.fov * 0.5 * Math.PI / 180.0;

    clock = new THREE.Clock();

    cameraControls = new FirstPersonCameraControls(camera);
    cameraControlsObject = cameraControls.getObject();
	scene.add(cameraControlsObject);

    gui.domElement.addEventListener("mouseenter", function (event) 
    {
        ableToEngagePointerLock = false;
    }, false);
    gui.domElement.addEventListener("mouseleave", function (event) 
    {
        ableToEngagePointerLock = true;
    }, false);
    document.body.addEventListener("click", function (event) {
        if (!ableToEngagePointerLock)
            return;
        this.requestPointerLock = this.requestPointerLock || this.mozRequestPointerLock;
        this.requestPointerLock();
    }, false);

    pointerlockChange = function (event) {
        if (document.pointerLockElement === document.body ||
            document.mozPointerLockElement === document.body || document.webkitPointerLockElement === document.body) {
            document.addEventListener('keydown', onKeyDown, false);
            document.addEventListener('keyup', onKeyUp, false);
            isPaused = false;
        }
        else {
            document.removeEventListener('keydown', onKeyDown, false);
            document.removeEventListener('keyup', onKeyUp, false);
            isPaused = true;
        }
    };

    document.addEventListener('pointerlockchange', pointerlockChange, false);
    document.addEventListener('mozpointerlockchange', pointerlockChange, false);
    document.addEventListener('webkitpointerlockchange', pointerlockChange, false);
}

function moveCamera() {
    cameraControls.getDirection(cameraDirectionVector);
    cameraDirectionVector.normalize();
    cameraControls.getUpVector(cameraUpVector);
    cameraUpVector.normalize();
    cameraControls.getRightVector(cameraRightVector);
    cameraRightVector.normalize();
    camera.getWorldQuaternion(cameraWorldQuaternion);
    if (keyPressed('KeyW') && !keyPressed('KeyS')) {
        cameraControlsObject.position.add(cameraDirectionVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    if ((keyPressed('KeyS')) && !(keyPressed('KeyW'))) {
        cameraControlsObject.position.sub(cameraDirectionVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    if ((keyPressed('KeyA')) && !(keyPressed('KeyD')) ) {
        cameraControlsObject.position.sub(cameraRightVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    if ((keyPressed('KeyD')) && !(keyPressed('KeyA'))) {
        cameraControlsObject.position.add(cameraRightVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    if (keyPressed('KeyE') && !keyPressed('KeyQ')) {
        cameraControlsObject.position.add(cameraUpVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    if (keyPressed('KeyQ') && !keyPressed('KeyE')) {
        cameraControlsObject.position.sub(cameraUpVector.multiplyScalar(cameraFlightSpeed * frameTime));
    }
    cameraControlsObject.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
}

function updateUniforms() {
    uniforms.spp.value = guiControls.spp;
    uniforms.MAX_RECURSION.value = guiControls.maxRecursion;
    uniforms.INDEX_OF_REFRACTION.value = guiControls.ir;
    uniforms.MIN_EPS.value = guiControls.epsilon;
    uniforms.cameraMatrix.value = camera.matrixWorld;
    uniforms.SKY_INTENSITY.value = guiControls.skyIntensity;
    uniforms.SUN_INTENSITY.value = guiControls.sunIntensity;
}

function animate() {
    requestAnimationFrame(animate);
    frameTime = clock.getDelta();
    moveCamera();

    updateUniforms();

    renderer.render(scene, camera);
    stats.update();
}