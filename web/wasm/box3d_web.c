#include "box3d/box3d.h"

#include <stdbool.h>
#include <stddef.h>

enum
{
	B3W_MAX_WORLDS = 8,
	B3W_MAX_BODIES = 256,
	B3W_MAX_JOINTS = 256,
};

typedef struct b3wWorldSlot
{
	bool active;
	b3WorldId worldId;
} b3wWorldSlot;

typedef struct b3wBodySlot
{
	bool active;
	int worldHandle;
	b3BodyId bodyId;
} b3wBodySlot;

typedef struct b3wJointSlot
{
	bool active;
	int worldHandle;
	b3JointId jointId;
} b3wJointSlot;

static b3wWorldSlot g_worlds[B3W_MAX_WORLDS];
static b3wBodySlot g_bodies[B3W_MAX_BODIES];
static b3wJointSlot g_joints[B3W_MAX_JOINTS];

static int b3wAllocWorldHandle( void )
{
	for ( int i = 0; i < B3W_MAX_WORLDS; ++i )
	{
		if ( !g_worlds[i].active )
		{
			return i + 1;
		}
	}
	return 0;
}

static int b3wAllocBodyHandle( void )
{
	for ( int i = 0; i < B3W_MAX_BODIES; ++i )
	{
		if ( !g_bodies[i].active )
		{
			return i + 1;
		}
	}
	return 0;
}

static int b3wAllocJointHandle( void )
{
	for ( int i = 0; i < B3W_MAX_JOINTS; ++i )
	{
		if ( !g_joints[i].active )
		{
			return i + 1;
		}
	}
	return 0;
}

static b3wWorldSlot* b3wGetWorldSlot( int handle )
{
	if ( handle <= 0 || handle > B3W_MAX_WORLDS )
	{
		return NULL;
	}

	b3wWorldSlot* slot = &g_worlds[handle - 1];
	return slot->active ? slot : NULL;
}

static b3wBodySlot* b3wGetBodySlot( int handle )
{
	if ( handle <= 0 || handle > B3W_MAX_BODIES )
	{
		return NULL;
	}

	b3wBodySlot* slot = &g_bodies[handle - 1];
	return slot->active ? slot : NULL;
}

static b3wJointSlot* b3wGetJointSlot( int handle )
{
	if ( handle <= 0 || handle > B3W_MAX_JOINTS )
	{
		return NULL;
	}

	b3wJointSlot* slot = &g_joints[handle - 1];
	return slot->active ? slot : NULL;
}

static int b3wRegisterBody( int worldHandle, b3BodyId bodyId )
{
	int handle = b3wAllocBodyHandle();
	if ( handle == 0 )
	{
		b3DestroyBody( bodyId );
		return 0;
	}

	g_bodies[handle - 1].active = true;
	g_bodies[handle - 1].worldHandle = worldHandle;
	g_bodies[handle - 1].bodyId = bodyId;
	return handle;
}

static int b3wRegisterJoint( int worldHandle, b3JointId jointId )
{
	int handle = b3wAllocJointHandle();
	if ( handle == 0 )
	{
		b3DestroyJoint( jointId, true );
		return 0;
	}

	g_joints[handle - 1].active = true;
	g_joints[handle - 1].worldHandle = worldHandle;
	g_joints[handle - 1].jointId = jointId;
	return handle;
}

static void b3wClearBodiesForWorld( int worldHandle )
{
	for ( int i = 0; i < B3W_MAX_BODIES; ++i )
	{
		if ( g_bodies[i].active && g_bodies[i].worldHandle == worldHandle )
		{
			g_bodies[i].active = false;
			g_bodies[i].worldHandle = 0;
			g_bodies[i].bodyId = ( b3BodyId ){ 0 };
		}
	}
}

static void b3wClearJointsForWorld( int worldHandle )
{
	for ( int i = 0; i < B3W_MAX_JOINTS; ++i )
	{
		if ( g_joints[i].active && g_joints[i].worldHandle == worldHandle )
		{
			b3DestroyJoint( g_joints[i].jointId, true );
			g_joints[i].active = false;
			g_joints[i].worldHandle = 0;
			g_joints[i].jointId = ( b3JointId ){ 0 };
		}
	}
}

static void b3wClearJointsForBody( b3BodyId bodyId )
{
	for ( int i = 0; i < B3W_MAX_JOINTS; ++i )
	{
		if ( g_joints[i].active )
		{
			b3BodyId bodyA = b3Joint_GetBodyA( g_joints[i].jointId );
			b3BodyId bodyB = b3Joint_GetBodyB( g_joints[i].jointId );
			if ( B3_ID_EQUALS( bodyA, bodyId ) || B3_ID_EQUALS( bodyB, bodyId ) )
			{
				b3DestroyJoint( g_joints[i].jointId, true );
				g_joints[i].active = false;
				g_joints[i].worldHandle = 0;
				g_joints[i].jointId = ( b3JointId ){ 0 };
			}
		}
	}
}

int b3wCreateWorld( float gravityX, float gravityY, float gravityZ )
{
	b3WorldDef def = b3DefaultWorldDef();
	def.gravity = ( b3Vec3 ){ gravityX, gravityY, gravityZ };
	def.workerCount = 1;
	def.enqueueTask = NULL;
	def.finishTask = NULL;
	def.userTaskContext = NULL;

	b3WorldId worldId = b3CreateWorld( &def );
	int handle = b3wAllocWorldHandle();
	if ( handle == 0 )
	{
		b3DestroyWorld( worldId );
		return 0;
	}

	g_worlds[handle - 1].active = true;
	g_worlds[handle - 1].worldId = worldId;
	return handle;
}

void b3wDestroyWorld( int worldHandle )
{
	b3wWorldSlot* slot = b3wGetWorldSlot( worldHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3wClearJointsForWorld( worldHandle );
	b3wClearBodiesForWorld( worldHandle );
	b3DestroyWorld( slot->worldId );
	slot->active = false;
	slot->worldId = ( b3WorldId ){ 0 };
}

int b3wCreateBody( int worldHandle, int bodyType, float px, float py, float pz, int enableSleep, int isAwake )
{
	b3wWorldSlot* worldSlot = b3wGetWorldSlot( worldHandle );
	if ( worldSlot == NULL )
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.type = (b3BodyType)bodyType;
	bodyDef.position = ( b3Vec3 ){ px, py, pz };
	bodyDef.enableSleep = enableSleep != 0;
	bodyDef.isAwake = isAwake != 0;
	return b3wRegisterBody( worldHandle, b3CreateBody( worldSlot->worldId, &bodyDef ) );
}

int b3wCreateBox( int worldHandle, float px, float py, float pz, float hx, float hy, float hz, int isStatic, float density )
{
	b3wWorldSlot* worldSlot = b3wGetWorldSlot( worldHandle );
	if ( worldSlot == NULL )
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.position = ( b3Vec3 ){ px, py, pz };
	if ( !isStatic )
	{
		bodyDef.type = b3_dynamicBody;
	}

	b3BodyId bodyId = b3CreateBody( worldSlot->worldId, &bodyDef );
	b3BoxHull hull = b3MakeBoxHull( hx, hy, hz );
	b3ShapeDef shapeDef = b3DefaultShapeDef();
	shapeDef.baseMaterial.friction = 0.6f;
	if ( !isStatic )
	{
		shapeDef.density = density > 0.0f ? density : 1.0f;
	}

	b3CreateHullShape( bodyId, &shapeDef, &hull.base );
	return b3wRegisterBody( worldHandle, bodyId );
}

int b3wCreateSphere( int worldHandle, float px, float py, float pz, float radius, float vx, float vy, float vz,
	float density )
{
	b3wWorldSlot* worldSlot = b3wGetWorldSlot( worldHandle );
	if ( worldSlot == NULL )
	{
		return 0;
	}

	b3BodyDef bodyDef = b3DefaultBodyDef();
	bodyDef.type = b3_dynamicBody;
	bodyDef.position = ( b3Vec3 ){ px, py, pz };
	bodyDef.linearVelocity = ( b3Vec3 ){ vx, vy, vz };
	b3BodyId bodyId = b3CreateBody( worldSlot->worldId, &bodyDef );
	b3ShapeDef shapeDef = b3DefaultShapeDef();
	shapeDef.baseMaterial.friction = 0.6f;
	shapeDef.density = density > 0.0f ? density : 1.0f;
	b3Sphere sphere = { .center = { 0.0f, 0.0f, 0.0f }, .radius = radius };
	b3CreateSphereShape( bodyId, &shapeDef, &sphere );
	return b3wRegisterBody( worldHandle, bodyId );
}

void b3wDestroyBody( int bodyHandle )
{
	b3wBodySlot* slot = b3wGetBodySlot( bodyHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3wClearJointsForBody( slot->bodyId );
	b3DestroyBody( slot->bodyId );
	slot->active = false;
	slot->worldHandle = 0;
	slot->bodyId = ( b3BodyId ){ 0 };
}

void b3wSetBodyTransform( int bodyHandle, float px, float py, float pz, float qx, float qy, float qz, float qw )
{
	b3wBodySlot* slot = b3wGetBodySlot( bodyHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3Body_SetTransform( slot->bodyId, ( b3Pos ){ px, py, pz }, ( b3Quat ){ { qx, qy, qz }, qw } );
}

void b3wSetBodyAwake( int bodyHandle, int awake )
{
	b3wBodySlot* slot = b3wGetBodySlot( bodyHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3Body_SetAwake( slot->bodyId, awake != 0 );
}

void b3wGetBodyLocalPoint( int bodyHandle, float wx, float wy, float wz, float* outPoint )
{
	if ( outPoint == NULL )
	{
		return;
	}

	b3wBodySlot* slot = b3wGetBodySlot( bodyHandle );
	if ( slot == NULL )
	{
		outPoint[0] = 0.0f;
		outPoint[1] = 0.0f;
		outPoint[2] = 0.0f;
		return;
	}

	b3Vec3 local = b3Body_GetLocalPoint( slot->bodyId, ( b3Pos ){ wx, wy, wz } );
	outPoint[0] = local.x;
	outPoint[1] = local.y;
	outPoint[2] = local.z;
}

int b3wCreateMotorJoint( int worldHandle, int bodyAHandle, int bodyBHandle, float localBx, float localBy, float localBz,
	float linearHertz, float linearDampingRatio, float maxSpringForce )
{
	b3wWorldSlot* worldSlot = b3wGetWorldSlot( worldHandle );
	b3wBodySlot* bodyASlot = b3wGetBodySlot( bodyAHandle );
	b3wBodySlot* bodyBSlot = b3wGetBodySlot( bodyBHandle );
	if ( worldSlot == NULL || bodyASlot == NULL || bodyBSlot == NULL )
	{
		return 0;
	}

	b3MotorJointDef jointDef = b3DefaultMotorJointDef();
	jointDef.base.bodyIdA = bodyASlot->bodyId;
	jointDef.base.bodyIdB = bodyBSlot->bodyId;
	jointDef.base.localFrameA = ( b3Transform ){ .p = b3Vec3_zero, .q = b3Quat_identity };
	jointDef.base.localFrameB = ( b3Transform ){ .p = ( b3Vec3 ){ localBx, localBy, localBz }, .q = b3Quat_identity };
	jointDef.linearHertz = linearHertz;
	jointDef.linearDampingRatio = linearDampingRatio;
	jointDef.maxSpringForce = maxSpringForce;
	return b3wRegisterJoint( worldHandle, b3CreateMotorJoint( worldSlot->worldId, &jointDef ) );
}

void b3wDestroyJoint( int jointHandle )
{
	b3wJointSlot* slot = b3wGetJointSlot( jointHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3DestroyJoint( slot->jointId, true );
	slot->active = false;
	slot->worldHandle = 0;
	slot->jointId = ( b3JointId ){ 0 };
}

void b3wStep( int worldHandle, float timeStep, int subStepCount )
{
	b3wWorldSlot* slot = b3wGetWorldSlot( worldHandle );
	if ( slot == NULL )
	{
		return;
	}

	b3World_Step( slot->worldId, timeStep, subStepCount );
}

void b3wGetBodyTransform( int bodyHandle, float* outTransform )
{
	if ( outTransform == NULL )
	{
		return;
	}

	b3wBodySlot* slot = b3wGetBodySlot( bodyHandle );
	if ( slot == NULL )
	{
		for ( int i = 0; i < 7; ++i )
		{
			outTransform[i] = 0.0f;
		}
		return;
	}

	b3Vec3 position = b3Body_GetPosition( slot->bodyId );
	b3Quat rotation = b3Body_GetRotation( slot->bodyId );
	outTransform[0] = position.x;
	outTransform[1] = position.y;
	outTransform[2] = position.z;
	outTransform[3] = rotation.v.x;
	outTransform[4] = rotation.v.y;
	outTransform[5] = rotation.v.z;
	outTransform[6] = rotation.s;
}

int main( void )
{
	return 0;
}
