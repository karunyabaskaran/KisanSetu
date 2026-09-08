import urllib.request

res = urllib.request.urlopen("http://127.0.0.1:5000/")
print("HTTP Status:", res.status)
print("Cache-Control Header:", res.headers.get("Cache-Control"))

content = res.read().decode("utf-8")
print("reg_role_static_field in served HTML:", "reg_role_static_field" in content)
print("<select id=\"reg_role\" in served HTML:", '<select id="reg_role"' in content)
print("sw.js?v=3.0 in served HTML:", "sw.js?v=3.0" in content)
print("app.js?v=3.0 in served HTML:", "app.js?v=3.0" in content)
