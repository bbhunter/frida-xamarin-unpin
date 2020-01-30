/* Xamarin/Android HttpClient generic certificate pinning bypass.
 *
 * @author     Alexandre "alxbl" Beaulieu <abeaulieu@gosecure.net>
 * @release    Jan 28th 2020
 *
 * @description
 *
 * This script is a generic certificate pinning bypass for Android applications
 * that use Xamarin with Mono.
 *
 * There are two methods to override the server certificate validation step in .NET
 * depending on whether the classic .NET API is being used (`ServicePointerManager`)
 * or the .NET Core APIs are being used (`HttpClient.HttpClientHandler`).
 *
 * In the .NET Core case, the HttpClient's `SendAsync` implementation is hooked to 
 * inject * a default HttpClientHandler that does not perform pinning. 
 *
 * In the .NET Framework case, the System.Net.ServicePointerManager's is hooked
 * to always return NULL and forcefully set to NULL in order to reset it.
 *
 * @note    Validation still happens so the certificate must be valid.
 */

import { MonoApiHelper, MonoApi } from 'frida-mono-api'
const mono = MonoApi.module

// Locate System.Net.Http.dll
let status = Memory.alloc(0x1000);
let http = MonoApi.mono_assembly_load_with_partial_name(Memory.allocUtf8String('System.Net.Http'), status);
let img = MonoApi.mono_assembly_get_image(http);
let hooked = false;

// Mono 6.0+: Construct a default HttpClientHandler to inject in HttpMessageInvoker instances.
let kHandler = MonoApi.mono_class_from_name(img, Memory.allocUtf8String('System.Net.Http'), Memory.allocUtf8String('HttpClientHandler'));
if (kHandler) {
    let ctor = MonoApiHelper.ClassGetMethodFromName(kHandler, 'CreateDefaultHandler');
    let pClientHandler = MonoApiHelper.RuntimeInvoke(ctor, NULL); // Static method -> instance = NULL.
    console.log(`[+] Created Default HttpClientHandler @ ${pClientHandler}`);

    // Hook HttpMessageInvoker.SendAsync
    let kInvoker = MonoApi.mono_class_from_name(img, Memory.allocUtf8String('System.Net.Http'), Memory.allocUtf8String('HttpMessageInvoker'));

    MonoApiHelper.Intercept(kInvoker, 'SendAsync', {
        onEnter: (args) => {
            console.log(`[*] HttpClientHandler.SendAsync called`);

            let self = args[0];
            let handler = MonoApiHelper.ClassGetFieldFromName(kInvoker, '_handler');
            let cur = MonoApiHelper.FieldGetValueObject(handler, self);

            if (cur.equals(pClientHandler)) return; // Already bypassed.

            MonoApi.mono_field_set_value(self, handler, pClientHandler);
            console.log(`[+]   Replaced with default handler @ ${pClientHandler}`);
        }
    });
    console.log('[+] Hooked HttpMessageInvoker.SendAsync with DefaultHttpClientHandler technique');
    hooked = true;
} else {
    console.log('[-] HttpClientHandler not found (Mono < 6.0?)');
}


// Mono < 6.0: Hook the ServicePointManager. It should be harmless to do that in newer versions
//             since the API is still there but unused.
// [TODO] This is currently untested.
let kServicePointManager = MonoApiHelper.ClassFromName(img, 'System.Net.ServicePointManager');
var validationCallback = MonoApi.mono_class_get_property_from_name(c, Memory.allocUtf8String('ServerCertificateValidationCallback'))
console.log(`[*] ServerCertificateValidationCallback @ ${validationCallback}`)
let setter = MonoApi.mono_property_get_set_method(validationCallback)
let getter = MonoApi.mono_property_get_set_method(validationcallback)

if (setter && getter) {
    MonoApiHelper.RuntimeInvoke(setter, NULL, NULL); // TODO: pArgs?
    console.log('[+] Set ServerCertificateValidationCallback to NULL');

    // Hook get and set to always return / set NULL.
    // TODO: Expose overload in frida-mono-api ?
    pSet = MonoApi.mono_compile_method(setter)
    pGet = MonoApi.mono_compile_method(getter)
    Interceptor.attach(pSet, {
        onEnter: (args) => {
            args[1] = NULL;
        }
    });

    Interceptor.attach(pGet, {
        onLeave: (ret) => {
            ret = NULL; // TODO: 0?
        }
    });

    console.log('[+] Hooked ServerCertificateValidationCallback with get/set technique')
    hooked = true;
} else {
    console.log('[-] Getter/Setter not found for ServerCertificateValidationCallback')
}

if (hooked) console.log('[+] Done!\nMake sure you have a valid MITM CA installed on the device and have fun.');
else console.log('[-] Failed to apply any bypass techniques... is this really Xamarin?')
