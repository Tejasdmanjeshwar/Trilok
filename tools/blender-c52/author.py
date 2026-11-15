#!/usr/bin/env python3
"""C5.2 offline Blender reference-authoring candidate.
Imports the exact pinned Trilok MakeHuman neutral skinned body + bone identities.
These renders are inspection evidence, NOT proof of anatomical correctness.
Blender 4.5.16, background mode. No browser/production dependency.
"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Quaternion

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DIRECTORY = Path(ARGS[0] if ARGS else "test-results/blender-c52")
DIRECTORY.mkdir(parents=True, exist_ok=True)
rig = json.loads((DIRECTORY / "source-rig.v1.json").read_text())
assert rig["schemaVersion"] == 1 and rig["vertices"] > 10000
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def cv(vec):
    """Trilok Y-up, +Z forward -> Blender Z-up, -Y forward."""
    x, y, z = vec
    return Vector((x, -z, y))

def material(name, color, metallic=0.0, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    return m

skin = material("MakeHuman source clay", (0.56, 0.43, 0.35), 0, .76)
steel = material("Blade steel", (.55, .69, .78), .8, .24)
brass = material("Guard and fittings", (.57, .36, .13), .65, .34)
leather = material("Hilt wrap", (.09, .065, .06), .03, .68)
wood = material("Staff wood", (.25, .14, .065), 0, .73)

verts, faces = [], []
for line in (DIRECTORY / "source-human.obj").open(encoding="utf-8"):
    if line.startswith("v "):
        verts.append(cv([float(s) for s in line.split()[1:4]]))
    elif line.startswith("f "):
        faces.append(tuple(int(s)-1 for s in line.split()[1:4]))
assert len(verts) == rig["vertices"] and len(faces) == rig["triangles"]
body_mesh = bpy.data.meshes.new("Pinned MakeHuman source surface")
body_mesh.from_pydata(verts, [], faces)
body_mesh.update()
body = bpy.data.objects.new("Human — original Trilok source skin", body_mesh)
bpy.context.collection.objects.link(body)
body.data.materials.append(skin)
for polygon in body_mesh.polygons:
    polygon.use_smooth = True

arm_data = bpy.data.armatures.new("MakeHuman semantic and skin-bone identities")
arm = bpy.data.objects.new("Source armature", arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bones = rig["bones"]
children = {i: [] for i in range(len(bones))}
for i, b in enumerate(bones):
    if b["parent"] is not None:
        children[b["parent"]].append(i)
for i, b in enumerate(bones):
    eb = arm_data.edit_bones.new(b["id"])
    head = cv(b["head"])
    tail = None
    # Prefer a plausible direct-child direction while preserving bone identity.
    for child in children[i]:
        candidate = cv(bones[child]["head"])
        if (candidate - head).length > .012:
            tail = candidate
            break
    if tail is None:
        tail = head + Vector((0, 0, .045))
    eb.head = head
    eb.tail = tail
for i, b in enumerate(bones):
    if b["parent"] is not None:
        arm_data.edit_bones[b["id"]].parent = arm_data.edit_bones[bones[b["parent"]]["id"]]
bpy.ops.object.mode_set(mode="OBJECT")
arm.hide_render = True
for i, b in enumerate(bones):
    body.vertex_groups.new(name=b["id"])
for vertex_index, influences in enumerate(rig["weights"]):
    for bone_index, weight in influences:
        body.vertex_groups[int(bone_index)].add([vertex_index], float(weight), "REPLACE")
body.parent = arm
modifier = body.modifiers.new("Pinned source weights", "ARMATURE")
modifier.object = arm
modifier.use_deform_preserve_volume = True

def joint(role):
    return arm.pose.bones[bones[rig["semantic"][role]]["id"]]

def source_pos(role):
    return cv(bones[rig["semantic"][role]]["head"])

def posed_pos(role):
    bpy.context.view_layer.update()
    return arm.matrix_world @ joint(role).head

def make_cylinder(name, center, axis, radius, length, mat, count=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=count, radius=radius, depth=length, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis.normalized())
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj

def make_box(name, center, shaft, width, length, depth, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(shaft.normalized())
    obj.dimensions = (width, depth, length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj

def weapon(kind, lead):
    sign = 1 if lead == "right" else -1
    chest = source_pos("chest")
    if kind == "longsword":
        center = chest + cv((0, -.18, .28))
        axis = cv((sign * .76, .51, .42)).normalized()
        hilt_length, blade_length, radius = .28, .86, .0135
        models = [make_cylinder("One shared longsword — fixed hilt", center, axis,
                                radius, hilt_length, leather)]
        guard = center + axis * (.14 + .0135 * .55)
        # Crossguard transverse to blade, not a second handle.
        x = cv((1, 0, 0))
        x = (x - axis * x.dot(axis)).normalized()
        models.append(make_cylinder("Continuous crossguard", guard, x, .012, .22, brass))
        models.append(make_cylinder("Pommel", center-axis*.158, axis, .022, .035, brass))
        blade_start = center + axis*(.14+.027)
        models.append(make_box("Single fixed 86cm blade",
                               blade_start + axis*.43, axis, .052, blade_length, .012, steel))
        goals = (.095, -.095)
    else:
        center = chest + cv((0, -.17, .31))
        axis = cv((sign * .94, .16, .30)).normalized()
        radius = .015
        models = [make_cylinder("ONE continuous 172cm staff",
                                center, axis, radius, 1.72, wood)]
        goals = (.245, -.245)
        for y in goals:
            models.append(make_cylinder("Staff contact band", center+axis*y,
                                        axis, radius*1.09, .014, leather))
    return models, center, axis, goals

def marker(name, point):
    empty = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(empty)
    empty.location = point
    empty.hide_render = True
    return empty

def solve_pose(kind, lead, center, axis, grips):
    positions = {}
    for hand, grip in [(lead, grips[0]), ("left" if lead=="right" else "right", grips[1])]:
        shoulder = source_pos("shoulder_"+hand)
        elbow = source_pos("elbow_"+hand)
        wrist = source_pos("wrist_"+hand)
        palm = source_pos("palm_"+hand)
        # Wrist target is offset from the single shaft's contact center,
        # NOT an independently equipped object.
        goal = center + axis*grip
        goal_wrist = goal - (palm-wrist)
        sign = -1 if hand=="left" else 1
        pole = shoulder + cv((sign*.37, -.21, .18))
        target = marker(hand+" wrist IK target", goal_wrist)
        pole_target = marker(hand+" elbow pole", pole)
        pb = joint("wrist_"+hand)
        constraint = pb.constraints.new("IK")
        constraint.name = "Anatomical arm reference — IK"
        constraint.target = target
        constraint.pole_target = pole_target
        constraint.chain_count = 3
        constraint.pole_angle = sign * math.pi/2
        constraint.use_tail = False
        positions[hand] = {"grip":tuple(round(v,6) for v in goal),
                           "pole":tuple(round(v,6) for v in pole)}
    # IK constrains the wrist BONE HEAD, not the palm landmark. Source palm
    # offset changes when wrist orientation rotates, so iteratively re-target
    # against the ACTUAL posed palm. A wrist-only solve can miss by >5cm.
    targets = {o.name.split(" wrist IK target")[0]:o for o in bpy.data.objects
               if o.type == "EMPTY" and o.name.endswith(" wrist IK target")}
    for iteration in range(18):
        bpy.context.view_layer.update()
        residual = 0
        for hand in ("left", "right"):
            error = Vector(positions[hand]["grip"]) - posed_pos("palm_"+hand)
            residual = max(residual, error.length)
            targets[hand].location += .78 * error
        if residual < .003:
            break
    bpy.context.view_layer.update()
    for hand in ("left","right"):
        positions[hand]["shoulder"] = tuple(round(v,6) for v in posed_pos("shoulder_"+hand))
        positions[hand]["elbow"] = tuple(round(v,6) for v in posed_pos("elbow_"+hand))
        positions[hand]["wrist"] = tuple(round(v,6) for v in posed_pos("wrist_"+hand))
        positions[hand]["palm"] = tuple(round(v,6) for v in posed_pos("palm_"+hand))
        positions[hand]["palmErrorMeters"] = round((posed_pos("palm_"+hand) -
                                                   Vector(positions[hand]["grip"])).length, 6)
    return positions

def clear_pose():
    for pose_bone in arm.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion.identity()
        pose_bone.location = (0,0,0)
        pose_bone.scale = (1,1,1)
    for o in list(bpy.data.objects):
        if o.type == "EMPTY":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()

world = bpy.context.scene.world
world.color = (.28,.28,.28)
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.25,.30,.37,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65
bpy.ops.object.light_add(type="AREA", location=(2.6,-3.7,4.5))
bpy.context.object.data.energy = 850
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 4
bpy.ops.object.light_add(type="AREA", location=(-2,1.5,3))
bpy.context.object.data.energy = 600
bpy.context.object.data.size = 3

bpy.ops.object.camera_add()
cam=bpy.context.object
bpy.context.scene.camera = cam
cam.data.type = "ORTHO"
scene=bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
scene.render.resolution_x=720
scene.render.resolution_y=820
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.film_transparent=False
scene.render.image_settings.color_mode="RGBA"

def shoot(name, location, look, scale):
    cam.location = location
    cam.rotation_euler = (look-location).to_track_quat("-Z","Y").to_euler()
    cam.data.ortho_scale = scale
    scene.render.filepath = str(DIRECTORY/(name+".png"))
    bpy.ops.render.render(write_still=True)
    print("C52 BLENDER RENDER",scene.render.filepath,flush=True)

references = []
for kind in ("longsword", "staff"):
    for lead in ("right","left"):
        clear_pose()
        models, center, axis, grip_offsets = weapon(kind,lead)
        positions = solve_pose(kind,lead,center,axis,grip_offsets)
        entry={"schemaVersion":1,"status":"UNREVIEWED_REFERENCE_CANDIDATE",
               "sourceRig":"pinned MakeHuman default", "kind":kind,"leadingHand":lead,
               "weapon":{"center":tuple(center),"axis":tuple(axis),
                         "gripOffsets":list(grip_offsets),
                         "handleLength":.28 if kind=="longsword" else 0,
                         "bladeLength":.86 if kind=="longsword" else 0,
                         "shaftLength":1.72 if kind=="staff" else 0},
               "hands":positions}
        references.append(entry)
        print("C52 BLENDER POSE",json.dumps(entry),flush=True)
        label=kind+"-"+lead
        torso = source_pos("chest")
        shoot(label+"-front",Vector((0,-4.5,1.38)),Vector((0,0,1.05)),2.15)
        shoot(label+"-side",Vector((4.0,-.6,1.4)),Vector((0,0,1.1)),2.15)
        shoot(label+"-three-quarter",Vector((2.7,-3.5,1.65)),Vector((0,0,1.08)),2.15)
        shoot(label+"-closeup",center+Vector((.62,-.85,.34)),center,.58)
        for obj in models:
            bpy.data.objects.remove(obj,do_unlink=True)
(DIRECTORY/"reference-poses.v1.json").write_text(json.dumps({
    "schemaVersion":1,"status":"UNREVIEWED_REFERENCE_CANDIDATE",
    "authoringTool":"Blender 4.5.16 LTS headless","poses":references},indent=2))
print("C52 BLENDER COMPLETED",len(references),"unreviewed pose candidates",flush=True)
