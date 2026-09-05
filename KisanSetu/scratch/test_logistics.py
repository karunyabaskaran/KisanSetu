import urllib.request
import json

def test_url(url, post_data=None):
    req = urllib.request.Request(url)
    if post_data is not None:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(post_data).encode('utf-8')
    else:
        data = None
    res = urllib.request.urlopen(req, data=data)
    return res.status, res.read().decode('utf-8')

# Test Frontend Assets
for path in ['/', '/css/style.css', '/js/i18n.js', '/js/api.js', '/js/logistics_hook.js', '/js/app.js']:
    status, content = test_url('http://127.0.0.1:5000' + path)
    print(f"Asset {path}: HTTP {status} (Length: {len(content)} bytes)")

# Test Chennai Corridor Optimization
status, raw = test_url('http://127.0.0.1:5000/api/logistics/optimize-route', {'corridor': 'chennai_corridor'})
data = json.loads(raw)
print("\n--- CHENNAI CORRIDOR ---")
print("Success:", data["success"])
print("Algorithm:", data["algorithm"])
print("Summary:", data["route_summary"])
print("Waypoints Sequence:")
for wp in data["waypoints"]:
    step = wp["step_number"]
    wtype = wp["type"]
    name = wp["name"]
    dist = wp["leg_distance_km"]
    eta = wp["eta_mins"]
    tlevel = wp["traffic_level"]
    print(f"  Step {step}: [{wtype}] {name} | Dist: {dist}km | ETA: +{eta}m | Traffic: {tlevel}")

# Test Mumbai-Pune Corridor Optimization
status, raw = test_url('http://127.0.0.1:5000/api/logistics/optimize-route', {'corridor': 'mumbai_pune_corridor'})
data2 = json.loads(raw)
print("\n--- MUMBAI PUNE CORRIDOR ---")
print("Success:", data2["success"])
print("Summary:", data2["route_summary"])
print("Waypoints count:", len(data2["waypoints"]))
print("Traffic segments count:", len(data2["traffic_segments"]))
