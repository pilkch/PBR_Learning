#define SHADER_NAME SIMPLE_TEXTURE

precision highp float;
varying vec2 vTextureCoord;
uniform sampler2D texture;
uniform sampler2D textureNormal;

uniform float		uLod;
uniform float		uMaxLod;
uniform float		uSize;
// uniform int			numSamples;



const float PI = 3.1415926535897932384626433832795;
const float TwoPI = PI * 2.0; 

const int numSamples = {{NUM_SAMPLES}};
#define saturate(x) clamp(x, 0.0, 1.0)

// #define TwoPI 3.1415926535897932384626433832795*2.0

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// Interesting page on Hammersley Points
// http://holger.dammertz.org/stuff/notes_HammersleyOnHemisphere.html#
vec2 Hammersley(int index, int numSamples ){
	// int reversedIndex = index;
	// reversedIndex = (reversedIndex << 16) | (reversedIndex >> 16);
	// reversedIndex = ((reversedIndex & 0x00ff00ff) << 8) | ((reversedIndex & 0xff00ff00) >> 8);
	// reversedIndex = ((reversedIndex & 0x0f0f0f0f) << 4) | ((reversedIndex & 0xf0f0f0f0) >> 4);
	// reversedIndex = ((reversedIndex & 0x33333333) << 2) | ((reversedIndex & 0xcccccccc) >> 2);
	// reversedIndex = ((reversedIndex & 0x55555555) << 1) | ((reversedIndex & 0xaaaaaaaa) >> 1);
	
	// return vec2(fract(float(index) / numSamples), float(reversedIndex) * 2.3283064365386963e-10);
	// return vec2(fract(float(index) / float(numSamples)), 1.0);
	return vec2(rand(vec2(float(index), float(numSamples))), rand(vec2(float(numSamples), float(index))));
	// return vec2(fract(float(index) / float(numSamples)), rand(vec2(float(numSamples), float(index))));
}

// straight from Epic paper for Siggraph 2013 Shading course
// http://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_slides.pdf

vec3 ImportanceSampleGGX( vec2 Xi, float Roughness4, vec3 N ) {
	float Phi = 2.0 * PI * Xi.x;
	float CosTheta = sqrt( (1.0 - Xi.y) / ( 1.0 + (Roughness4 - 1.0) * Xi.y ) );
	float SinTheta = sqrt( 1.0 - CosTheta * CosTheta );
	
	vec3 H;
	H.x = SinTheta * cos( Phi );
	H.y = SinTheta * sin( Phi );
	H.z = CosTheta;
	
	vec3 UpVector = abs( N.z ) < 0.999 ? vec3(0,0,1) : vec3(1,0,0);
	vec3 TangentX = normalize( cross( UpVector, N ) );
	vec3 TangentY = cross( N, TangentX );
	
	// Tangent to world space
	return TangentX * H.x + TangentY * H.y + N * H.z;
}


// http://the-witness.net/news/2012/02/seamless-cube-map-filtering/
vec3 fix_cube_lookup( vec3 v, float cube_size, float lod ) {
	float M = max(max(abs(v.x), abs(v.y)), abs(v.z));
	float scale = 1.0 - exp2(lod) / cube_size;
	if (abs(v.x) != M) v.x *= scale;
	if (abs(v.y) != M) v.y *= scale;
	if (abs(v.z) != M) v.z *= scale;
	return v;
}

vec2 envMapEquirect(vec3 wcNormal, float flipEnvMap) {
  //I assume envMap texture has been flipped the WebGL way (pixel 0,0 is a the bottom)
  //therefore we flip wcNorma.y as acos(1) = 0
  float phi = acos(-wcNormal.y);
  float theta = atan(flipEnvMap * wcNormal.x, wcNormal.z) + PI;
  return vec2(theta / TwoPI, phi / PI);
}

vec2 envMapEquirect(vec3 wcNormal) {
    //-1.0 for left handed coordinate system oriented texture (usual case)
    return envMapEquirect(wcNormal, -1.0);
}


vec3 getTextureLod(sampler2D texture, vec3 N) {
	vec2 newUV = envMapEquirect(N);
	newUV.x -= .25;
	newUV.x = mod(newUV.x, 1.0);
	newUV.x = 1.0 - newUV.x;
	return texture2D(texture, newUV).rgb;
}



vec3 PrefilterEnvMap( float roughness, vec3 R )
{
	vec3 N                = R;
	vec3 V                = R;
	
	vec3 prefilteredColor = vec3(0.0);
	float totalWeight     = 0.0;
	
	// int numSamples = 8192 / int( uMaxLod - uLod );
	for(int i=0; i<numSamples; ++i)
	{
		vec2 xi  = Hammersley(i, numSamples);
		vec3 H   = ImportanceSampleGGX(xi, roughness, N);
		vec3 L   = 2.0 * dot(V, H) * H - V;
		float  NoL = saturate(dot(N, L));
		NoL = 1.0;

		if(NoL>0.0)
		{
			vec3 lookup = fix_cube_lookup( L, uSize, uLod );
			// prefilteredColor += getTextureLod( texture, L) * NoL;
			prefilteredColor += getTextureLod( texture, lookup) * NoL;
			totalWeight += NoL;
		}
	}
	
	return prefilteredColor / totalWeight;
}


void main(void) {
	vec3 color      = texture2D( texture, vTextureCoord ).rgb;
	float roughness = uLod / uMaxLod;
	vec3 N          = texture2D( textureNormal, vTextureCoord).rgb * 2.0 - 1.0;
	color           = PrefilterEnvMap( pow( roughness, 6.0 ), N );
	
	gl_FragColor    = vec4(color, 1.0);
}