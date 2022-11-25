fragmentShader = `
precision highp float;
precision highp int;

uvec2 seed;
const float PI = 3.14159265358979323;
const float TWO_PI = 6.28318530717958648;
const float INFINITY = 1000000.0;

// Material 
const int MAX_SPHERES = 20;
const int MAX_TRIANGLES = 20;
const int LIGHT = 0;
const int DIFFUSIVE = 1;
const int REFLECTIVE = 2;
const int REFRACTIVE = 3;

const float PROB_DIFF = 0.9;

uniform vec2 randomVec2;
uniform mat4 cameraMatrix;
uniform vec2 resolution;
uniform int spp;
uniform float canvasU;
uniform float canvasV;
uniform int MAX_RECURSION;
uniform float INDEX_OF_REFRACTION;
uniform float MIN_EPS;
uniform float SKY_INTENSITY;
uniform float SUN_INTENSITY;

vec3 camRight;
vec3 camUp;
vec3 camForward;

// utilities - start ======================================================================
float rng() {
	seed += uvec2(1);
    uvec2 q = 1103515245U * ( (seed >> 1U) ^ (seed.yx) );
    uint  n = 1103515245U * ( (q.x) ^ (q.y >> 3U) );
	return float(n) * (1.0 / float(0xffffffffU));
}

vec3 randomSphereDirection() {
    float up = rng() * 2.0 - 1.0;
	float over = sqrt( max(0.0, 1.0 - up * up) );
	float around = rng() * TWO_PI;
	return normalize(vec3(cos(around) * over, up, sin(around) * over));	
}

vec3 randomCosWeightedDirectionInHemisphere(vec3 nl) {
	float z = rng() * 2.0 - 1.0;
	float phi = rng() * TWO_PI;
	float r = sqrt(1.0 - z * z);
    return normalize(nl + vec3(r * cos(phi), r * sin(phi), z));
}

float tentFilter(float x) { // input: x: a random float(0.0 to 1.0), output: a filtered float (-1.0 to +1.0) {
	return (x < 0.5) ? sqrt(2.0 * x) - 1.0 : 1.0 - sqrt(2.0 - (2.0 * x));
}
// utilities - end ======================================================================

// Geometry - start ======================================================================
struct Material {
    vec3 emissive;
    vec3 color;
    int type;
};

struct Sphere {
    vec3 center;
    float radius;

    Material mat;
};

struct Triangle{
    vec3 v0;
    vec3 v1;
    vec3 v2;
    bool doubleSided;

    Material mat;
};


struct Scene {
    Sphere spheres[MAX_SPHERES];

    Triangle triangles[MAX_TRIANGLES];

    int nSpheres;
    int nTriangles;
};

void addSphere(inout Scene scene, Sphere s) {
    scene.spheres[scene.nSpheres++] = s;
}

void addTriangle(inout Scene scene, Triangle t) {
    scene.triangles[scene.nTriangles++] = t;
}


Scene buildScene() {
    Scene scene;
    scene.nSpheres = 0;
    scene.nTriangles = 0;

    Material matGround = Material(vec3(0), vec3(0.8, 0.8, 0.0), DIFFUSIVE);
    Material matCenter = Material(vec3(0), vec3(0.95, 0.95, 0.85), REFRACTIVE);
    Material matLeft = Material(vec3(0), vec3(0.9,0.9,0.9), REFLECTIVE);
    Material matRight = Material(vec3(0), vec3(0.7, 0.3, 0.3), DIFFUSIVE);
    Material matBack = Material(vec3(0), vec3(0.48, 0.83, 0.93), DIFFUSIVE);
    Material matSun = Material(vec3(SUN_INTENSITY), vec3(1), DIFFUSIVE);
    Material matTri1 = Material(vec3(0), vec3(1,1,0), DIFFUSIVE);
    Material matTri2 = Material(vec3(0.8,0,5), vec3(0.7,0.7,0), REFLECTIVE);

    addSphere(scene, Sphere(vec3(-1.2,0,-5), 0.5, matLeft));
    addSphere(scene, Sphere(vec3(0,-0.2,-5), 0.3, matCenter));
    addSphere(scene, Sphere(vec3(1.2, 0.0,-4.5), 0.5, matRight)); 
    addSphere(scene, Sphere(vec3(0,-100.5,-5), 100.0, matGround));
    addSphere(scene, Sphere(vec3(1.0, 0.0, -10.0), 1.0, matBack));
    addSphere(scene, Sphere(vec3(0.0, 0.0, -30 ), 10.0, matSun));
    
    addTriangle(scene, Triangle(vec3(-1,0,-15), vec3(1,0,-15), vec3(0,2,-15), false, matTri1));
    addTriangle(scene, Triangle(vec3(-3,0,-10), vec3(-1,0,-10), vec3(0,2,-10), true, matTri2));
    return scene;
}
// Geometry - end ======================================================================

// Ray - start ======================================================================
struct Ray {
    vec3 origin;
    vec3 dir;
};

vec3 rayAt(Ray r, float dist) {
    return r.origin + r.dir*dist;
}

struct HitRecord {
    vec3 hitPoint;
    vec3 normal;
    float dist;
    bool frontFace;

    Material mat;
};

bool hitSphere(Sphere s, Ray r, float tMin, float tMax, out HitRecord rec) {
    vec3 oc = r.origin - s.center;
    float a = dot( r.dir, r.dir );
    float b = 2.0 * dot(r.dir, oc);
    float c = dot(oc, oc) - s.radius*s.radius;
    float discriminant = b*b - 4.0*a*c;
    if (discriminant < 0.0)
        return false;
    else {
        float root = (-b-sqrt(discriminant)) / 2.0*a;
        if (root < tMin || root > tMax) {
            root = (-b+sqrt(discriminant)) / 2.0*a;
            if (root < tMin || root > tMax)
                return false;
        }
        rec.dist = root;
        rec.hitPoint = rayAt(r, root);
        rec.normal = (rec.hitPoint - s.center) / s.radius;
        rec.frontFace = dot(rec.normal, r.dir) < 0.0;
        rec.mat = s.mat;
        return true;
    }
}

bool hitTriangle(Triangle tri, Ray r, float tMin, float tMax, out HitRecord rec) {
    vec3 edge1 = tri.v1 - tri.v0;
    vec3 edge2 = tri.v2 - tri.v1;
    vec3 pvec = cross(r.dir, edge2);
    float det = 1.0 / dot(edge1, pvec);
    if (!tri.doubleSided && det < 0.0)
        return false;
    vec3 tvec = r.origin - tri.v0;
    float u = dot(tvec, pvec) * det;
    if (u < 0.0 || u > 1.0)
        return false;
    vec3 qvec = cross(tvec, edge1);
    float v = dot(r.dir, qvec) * det;
    if (v < 0.0 || u+v > 1.0)
        return false;
    float t = dot(edge2, qvec) * det;
    if (t < tMin || t > tMax) 
        return false;
    rec.dist = t;
    rec.hitPoint = rayAt(r, t);
    rec.normal = normalize(cross(edge1, edge2));
    rec.frontFace = det < 0.0;
    rec.mat = tri.mat;
    return true;
}

bool hitScene(Scene scene, Ray r, float tMin, float tMax, out HitRecord rec) {
    HitRecord tempRecord;
    bool isHit = false;
    float closestSoFar = tMax;

    for (int i = 0; i != scene.nSpheres; i++) {
        Sphere s = scene.spheres[i];
        if (hitSphere(s, r, tMin, closestSoFar, tempRecord)) {
            isHit = true;
            closestSoFar = tempRecord.dist;
            rec = tempRecord;
        };
    }
    for (int i = 0; i != scene.nTriangles; i++) {
        Triangle t = scene.triangles[i];
        if (hitTriangle(t, r, tMin, closestSoFar, tempRecord)) {
            isHit = true;
            closestSoFar = tempRecord.dist;
            rec = tempRecord;
        }
    }

    return isHit;
}

Ray genRay() {
    vec2 pixelOffset = vec2( tentFilter(rng()), tentFilter(rng()) );
    vec2 pixelPos = (gl_FragCoord.xy + pixelOffset) / resolution * 2.0 - 1.0;
    vec3 rayDir = normalize( pixelPos.x * camRight * canvasU + pixelPos.y * camUp * canvasV + camForward );
    return Ray( cameraPosition, rayDir );
}

bool scatterDiffusive(Ray rIn, HitRecord rec, out vec3 attenuation, out Ray rOut) {
    if (rng() < PROB_DIFF) {
        vec3 target = rec.hitPoint + rec.normal + rng()*randomSphereDirection();
        vec3 dir = target-rec.hitPoint;
        if (length(dir) < 1e-5) dir = rec.normal;
        attenuation = rec.mat.color;
        rOut = Ray(rec.hitPoint, normalize(dir));
        return true;
    } else {
        attenuation = rec.mat.color / PROB_DIFF;
        return false;
    }
}

bool scatterReflective(Ray r, HitRecord rec, out vec3 attenuation, out Ray rOut) {
    vec3 dir = normalize(r.dir - 2.0 * dot(r.dir, rec.normal) * rec.normal);
    rOut = Ray(rec.hitPoint, dir);
    attenuation = rec.mat.color;
    return true;
}

float reflectance(float cosine, float refIdx) {
    float r0 = (1.0-refIdx) / (1.0+refIdx);
    r0 = r0*r0;
    return r0 + (1.0-r0)*pow(1.0-cosine, 5.0);
}

bool scatterRefractive(Ray r, HitRecord rec, out vec3 attenuation, out Ray rOut) {
    float refractionRatio = rec.frontFace ? 1.0 / INDEX_OF_REFRACTION : INDEX_OF_REFRACTION;
    vec3 normal = rec.frontFace ? rec.normal : -rec.normal;
    vec3 newDir;

    float cosTheta = dot(-r.dir, normal);
    float sinTheta = sqrt(1.0-cosTheta*cosTheta);
    bool refractOK = refractionRatio * sinTheta <= 1.0;

    if (!refractOK || reflectance(cosTheta, refractionRatio) > rng()) {
        newDir = normalize(r.dir - 2.0 * dot(r.dir, normal) * normal);
    } else {
        vec3 dirPerp = refractionRatio * sinTheta * normalize(r.dir+cosTheta*normal);
        vec3 dirPara = -normal * sqrt(1.0 - length(dirPerp)*length(dirPerp));
        newDir = dirPerp + dirPara;
    }
    attenuation = rec.mat.color;
    rOut = Ray(rec.hitPoint, newDir);
    return true;
}

vec3 traceRay(Ray r, Scene scene) {
    HitRecord rec;
    vec3 color = vec3(0);
    vec3 totalAttenuation = vec3(1);
    vec3 attenuation;

    Ray scattered;
    bool proceed;
    for (int i = 0; i != MAX_RECURSION; i++) {
        bool isHit = hitScene(scene, r, MIN_EPS, INFINITY, rec);
        if (isHit) {
            if (rec.mat.type == DIFFUSIVE) {
                proceed = scatterDiffusive(r, rec, attenuation, scattered);
            } else if (rec.mat.type == REFLECTIVE) {
                proceed = scatterReflective(r, rec, attenuation, scattered);
            } else if (rec.mat.type == REFRACTIVE) {
                proceed = scatterRefractive(r, rec, attenuation, scattered);
            } else {
                color = vec3(0);
                break;
            }
            totalAttenuation *= attenuation;
            color += rec.mat.emissive;
            if (proceed) r = scattered;
            else break;
        } else { // hit sky
            vec3 unitDir = normalize(r.dir);
            float t = 0.5 * (unitDir.y + 1.0);
            color += ((1.0-t)*vec3(1.0, 1.0, 1.0) + t*vec3(0.5, 0.7, 1.0)) * SKY_INTENSITY;
            break;
        }
        if (i == MAX_RECURSION-1) color = vec3(0);
    }
    return color*totalAttenuation;
}

vec3 traceRays(Scene scene) {
    vec3 color = vec3(0);
    for (int i = 0; i != spp; i++) {
        Ray r = genRay();
        color += traceRay(r, scene);
    }
    return color/float(spp);
}
// Ray - end ======================================================================


void main() {
    camRight   = vec3( cameraMatrix[0][0],  cameraMatrix[0][1],  cameraMatrix[0][2]);
	camUp      = vec3( cameraMatrix[1][0],  cameraMatrix[1][1],  cameraMatrix[1][2]);
	camForward = vec3(-cameraMatrix[2][0], -cameraMatrix[2][1], -cameraMatrix[2][2]);
	
    seed = uvec2(gl_FragCoord) * uvec2(randomVec2);

    Scene scene = buildScene();

    vec3 color = traceRays(scene);
    gl_FragColor = vec4(color.xyz, 1.0);
}
`
