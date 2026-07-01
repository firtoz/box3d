add_executable(box3d_web box3d_web.c)

target_link_libraries(box3d_web PRIVATE box3d)
target_include_directories(box3d_web PRIVATE "${CMAKE_SOURCE_DIR}/include")

set_target_properties(box3d_web PROPERTIES
  C_STANDARD 17
  C_STANDARD_REQUIRED YES
  C_EXTENSIONS YES
  OUTPUT_NAME box3d-web
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/../public/wasm"
)

target_link_options(box3d_web PRIVATE
  "SHELL:-sMODULARIZE=1"
  "SHELL:-sEXPORT_ES6=1"
  "SHELL:-sSINGLE_FILE=1"
  "SHELL:-sENVIRONMENT=web"
  "SHELL:-sALLOW_MEMORY_GROWTH=1"
  "SHELL:-sNO_EXIT_RUNTIME=1"
  "SHELL:-sEXPORTED_RUNTIME_METHODS=['cwrap','HEAPF32']"
  "SHELL:-sEXPORTED_FUNCTIONS=['_main','_malloc','_free','_b3wCreateWorld','_b3wDestroyWorld','_b3wCreateBody','_b3wCreateBox','_b3wCreateSphere','_b3wDestroyBody','_b3wDestroyJoint','_b3wSetBodyTransform','_b3wSetBodyAwake','_b3wGetBodyLocalPoint','_b3wCreateMotorJoint','_b3wStep','_b3wGetBodyTransform']"
)
