#version 150

uniform samplerCube uRadianceMap;
uniform samplerCube uIrradianceMap;

uniform sampler2D 	uNormalMap;
uniform sampler2D 	uRoughnessMap;
uniform sampler2D 	uMetallicMap;

uniform vec3		uBaseColor;
uniform float		uRoughness;
uniform float		uRoughness4;
uniform float		uMetallic;
uniform float		uSpecular;

uniform float		uExposure;
uniform float		uGamma;

in vec3             vNormal;
in vec3             vPosition;
in vec3				vEyePosition;
in vec3				vWsNormal;
in vec3				vWsPosition;
in vec3             vOrgPosition;
in vec2				vUv;
//in float            vRoughnessOffset;

out vec4            oColor;

#define saturate(x) clamp(x, 0.0, 1.0)
#define PI 3.1415926535897932384626433832795


// Filmic tonemapping from
// http://filmicgames.com/archives/75

const float A = 0.15;
const float B = 0.50;
const float C = 0.10;
const float D = 0.20;
const float E = 0.02;
const float F = 0.30;

vec3 Uncharted2Tonemap( vec3 x )
{
	return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}

// https://www.unrealengine.com/blog/physically-based-shading-on-mobile
vec3 EnvBRDFApprox( vec3 SpecularColor, float Roughness, float NoV )
{
	const vec4 c0 = vec4( -1, -0.0275, -0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, -0.04 );
	vec4 r = Roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( -9.28 * NoV ) ) * r.x + r.y;
	vec2 AB = vec2( -1.04, 1.04 ) * a004 + r.zw;
	return SpecularColor * AB.x + AB.y;
}


// http://the-witness.net/news/2012/02/seamless-cube-map-filtering/
vec3 fix_cube_lookup( vec3 v, float cube_size, float lod ) {
	float M = max(max(abs(v.x), abs(v.y)), abs(v.z));
	float scale = 1 - exp2(lod) / cube_size;
	if (abs(v.x) != M) v.x *= scale;
	if (abs(v.y) != M) v.y *= scale;
	if (abs(v.z) != M) v.z *= scale;
	return v;
}

vec3 blendNormalsUnity( vec3 baseNormal, vec3 detailsNormal )
{
    vec3 n1 = baseNormal;
    vec3 n2 = detailsNormal;
    mat3 nBasis = mat3(
                       vec3(n1.z, n1.y, -n1.x), // +90 degree rotation around y axis
                       vec3(n1.x, n1.z, -n1.y), // -90 degree rotation around x axis
                       vec3(n1.x, n1.y,  n1.z));
    return normalize(n2.x*nBasis[0] + n2.y*nBasis[1] + n2.z*nBasis[2]);
}
vec3 blendNormals( vec3 n1, vec3 n2 )
{
    return blendNormalsUnity( n1, n2 );
}

void main() {
    const float range       = 0.75;
    float vRoughnessOffset  = (abs(vOrgPosition.y) < range || abs(vOrgPosition.x) < range || abs(vOrgPosition.z) < range) ? 0.0 : 1.0;
    vec3 baseColor      = vRoughnessOffset < 1.0 ? uBaseColor : vec3(1.0, 1.0, 0.000015);
    
    float roughnessMask	= texture( uRoughnessMap, vUv ).r;
    float metallicMask	= texture( uMetallicMap, vUv ).r;

    float roughness     = uRoughness * vRoughnessOffset;
    float roughness4    = uRoughness4 * vRoughnessOffset;
    float metallic      = uMetallic * (1.0 - vRoughnessOffset);
    float _specular     = uSpecular * (1.0 - vRoughnessOffset);
    
    roughnessMask       = mix(roughnessMask, 1.0, .005);
    metallicMask        = mix(metallicMask, 1.0, .005);
    
    roughness           *= roughnessMask;
    roughness4          *= roughnessMask;
    metallic            *= metallicMask;
    
	
	vec3 N 				= normalize( vWsNormal );
    N 					= blendNormals( N, texture( uNormalMap, vUv ).xyz );
    
	vec3 V 				= normalize( vEyePosition );
    
	
	// deduce the diffuse and specular color from the baseColor and how metallic the material is
	vec3 diffuseColor	= baseColor - baseColor * metallic;
	vec3 specularColor	= mix( vec3( 0.08 * _specular ), baseColor, metallic );
	
	vec3 color;
	
	// sample the pre-filtered cubemap at the corresponding mipmap level
	int numMips			= 6;
    
	float mip			= numMips - 1 + log2(roughness);
	vec3 lookup			= -reflect( V, N );
	lookup				= fix_cube_lookup( lookup, 512, mip );
	vec3 radiance		= pow( textureLod( uRadianceMap, lookup, mip ).rgb, vec3( 2.2f ) );
	vec3 irradiance		= pow( texture( uIrradianceMap, N ).rgb, vec3( 2.2f ) );
	
	// get the approximate reflectance
	float NoV			= saturate( dot( N, V ) );
	vec3 reflectance	= EnvBRDFApprox( specularColor, roughness4, NoV );
	
	// combine the specular IBL and the BRDF
    vec3 diffuse  		= diffuseColor * irradiance;
    vec3 specular 		= radiance * reflectance;
	color				= diffuse + specular;
	
	// apply the tone-mapping
	color				= Uncharted2Tonemap( color * uExposure );
	// white balance
	color				= color * ( 1.0f / Uncharted2Tonemap( vec3( 20.0f ) ) );
	
	// gamma correction
	color				= pow( color, vec3( 1.0f / uGamma ) );
	
	// output the fragment color
    oColor				= vec4( color, 1.0 );
}