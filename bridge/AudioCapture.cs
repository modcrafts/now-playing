using System;
using System.Diagnostics;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace NowPlayingAudio
{
    // No recorded audio is written to disk or sent to the browser: only 44 FFT levels.
    public static class Capture
    {
        static readonly Guid ClientId = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
        static readonly Guid CaptureId = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
        [DllImport("ole32.dll")] static extern int CoInitializeEx(IntPtr p, uint flags);
        [DllImport("ole32.dll")] static extern void CoUninitialize();
        [DllImport("Mmdevapi.dll", CharSet=CharSet.Unicode)] static extern int ActivateAudioInterfaceAsync(string path, ref Guid iid, IntPtr activation, IActivateCallback callback, out IActivateOperation operation);
        static void Check(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }
        static string Escape(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " "); }
        static void Status(string status, string source, string message, int pid, int sampleRate)
        {
            Console.WriteLine("{\"type\":\"audio-status\",\"status\":\""+status+"\",\"source\":\""+source+"\",\"message\":\""+Escape(message)+"\",\"pid\":"+pid+",\"sampleRate\":"+sampleRate+"}");
        }
        static int ApplePid()
        {
            try { foreach(SessionInfo session in AppleSessions()) if(session.State==1) return session.Pid; } catch {}
            foreach (Process p in Process.GetProcessesByName("AppleMusic"))
            {
                using (p) { try { if (!p.HasExited) return p.Id; } catch {} }
            }
            return 0;
        }
        public sealed class SessionInfo { public int Pid,State; public string Name; public float Peak; }
        public static SessionInfo[] AppleSessions()
        {
            List<SessionInfo> found=new List<SessionInfo>();
            IMMDeviceEnumerator enumerator=(IMMDeviceEnumerator)new DeviceEnumerator(); IMMDevice device=null; IAudioSessionManager2 manager=null; IAudioSessionEnumerator sessions=null;
            try
            {
                Check(enumerator.GetDefaultAudioEndpoint(0,1,out device));
                Guid id=new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"); object service;
                Check(device.Activate(ref id,23,IntPtr.Zero,out service)); manager=(IAudioSessionManager2)service;
                Check(manager.GetSessionEnumerator(out sessions)); int count; Check(sessions.GetCount(out count));
                for(int i=0;i<count;i++)
                {
                    object value=null;
                    try
                    {
                        Check(sessions.GetSession(i,out value)); IAudioSessionControl2 control=(IAudioSessionControl2)value;
                        uint pid; Check(control.GetProcessId(out pid)); if(pid==0) continue;
                        using(Process p=Process.GetProcessById((int)pid))
                        {
                            if(!p.ProcessName.Equals("AppleMusic",StringComparison.OrdinalIgnoreCase)&&!p.ProcessName.Equals("AMPLibraryAgent",StringComparison.OrdinalIgnoreCase))continue;
                            int state;Check(control.GetState(out state));float peak=0;
                            try { ((IAudioMeterInformation)value).GetPeakValue(out peak); } catch {}
                            found.Add(new SessionInfo{Pid=(int)pid,Name=p.ProcessName,State=state,Peak=peak});
                        }
                    }
                    catch {} finally { if(value!=null)Marshal.ReleaseComObject(value); }
                }
            }
            finally
            {
                if(sessions!=null)Marshal.ReleaseComObject(sessions);if(manager!=null)Marshal.ReleaseComObject(manager);
                if(device!=null)Marshal.ReleaseComObject(device);Marshal.ReleaseComObject(enumerator);
            }
            return found.ToArray();
        }
        static IAudioClient ProcessClient(int pid)
        {
            IntPtr data=Marshal.AllocCoTaskMem(12), variant=Marshal.AllocCoTaskMem(24);
            IActivateOperation operation=null;
            Activation callback=new Activation();
            try
            {
                for(int i=0;i<24;i++) Marshal.WriteByte(variant,i,0);
                Marshal.WriteInt32(data,0,1); // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
                Marshal.WriteInt32(data,4,pid);
                Marshal.WriteInt32(data,8,0); // include the target process and its children
                Marshal.WriteInt16(variant,0,65); // VT_BLOB
                Marshal.WriteInt32(variant,8,12);
                Marshal.WriteIntPtr(variant,IntPtr.Size==8?16:12,data);
                Guid id=ClientId;
                Check(ActivateAudioInterfaceAsync("VAD\\Process_Loopback",ref id,variant,callback,out operation));
                if(!callback.Completed.WaitOne(8000)) throw new TimeoutException("Process audio activation timed out");
                Check(callback.Result);
                return (IAudioClient)callback.Client;
            }
            finally
            {
                // Keep callback alive until Windows completes its asynchronous COM activation.
                GC.KeepAlive(callback);
                if(callback.Completed.WaitOne(0))
                {
                    if(operation!=null) Marshal.ReleaseComObject(operation);callback.Completed.Dispose();
                    Marshal.FreeCoTaskMem(data);Marshal.FreeCoTaskMem(variant);
                }
                else
                {
                    // On timeout Windows can still be using the callback and activation blob.
                    IActivateOperation pending=operation;IntPtr pendingData=data,pendingVariant=variant;
                    ThreadPool.QueueUserWorkItem(delegate(object ignored) {
                        callback.Completed.WaitOne();
                        if(pending!=null)Marshal.ReleaseComObject(pending);
                        Marshal.FreeCoTaskMem(pendingData);Marshal.FreeCoTaskMem(pendingVariant);callback.Completed.Dispose();
                    });
                }
            }
        }
        static IAudioClient SystemClient(out string deviceId)
        {
            IMMDeviceEnumerator enumerator=(IMMDeviceEnumerator)new DeviceEnumerator();
            IMMDevice device=null;
            try
            {
                Check(enumerator.GetDefaultAudioEndpoint(0,1,out device));
                Check(device.GetId(out deviceId));
                object value; Guid id=ClientId;
                Check(device.Activate(ref id,23,IntPtr.Zero,out value));
                return (IAudioClient)value;
            }
            finally { if(device!=null) Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(enumerator); }
        }
        static string DefaultDeviceId()
        {
            IMMDeviceEnumerator enumerator=(IMMDeviceEnumerator)new DeviceEnumerator(); IMMDevice device=null;
            try { string id; Check(enumerator.GetDefaultAudioEndpoint(0,1,out device)); Check(device.GetId(out id)); return id; }
            finally { if(device!=null) Marshal.ReleaseComObject(device); Marshal.ReleaseComObject(enumerator); }
        }
        public static void Run(string mode, int seconds)
        {
            // Process loopback clients must remain in the MTA used by async activation.
            if(Thread.CurrentThread.GetApartmentState()!=ApartmentState.MTA)
            {
                Thread worker=new Thread(delegate() { RunMta(mode,seconds); });
                worker.SetApartmentState(ApartmentState.MTA); worker.Start(); worker.Join();
            }
            else RunMta(mode,seconds);
        }
        static void RunMta(string mode, int seconds)
        {
            CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
            int init=CoInitializeEx(IntPtr.Zero,0);
            if(init<0 && init!=unchecked((int)0x80010106)) Check(init);
            Stopwatch lifetime=Stopwatch.StartNew();
            try
            {
                do
                {
                    int pid=mode=="apple"?ApplePid():0;
                    if(mode=="apple" && pid==0) { Status("waiting",mode,"Waiting for Apple Music",0,0); Thread.Sleep(1000); continue; }
                    try { CaptureStream(mode,pid,lifetime,seconds); }
                    catch(Exception e) { Status("error",mode,e.Message,pid,0); Thread.Sleep(1500); }
                } while(seconds<=0 || lifetime.Elapsed.TotalSeconds<seconds);
            }
            finally { if(init>=0) CoUninitialize(); }
        }
        static void CaptureStream(string mode,int pid,Stopwatch lifetime,int seconds)
        {
            IAudioClient client=null; IAudioCaptureClient capture=null; IntPtr formatPtr=IntPtr.Zero;
            AutoResetEvent ready=new AutoResetEvent(false); bool started=false;
            ManualResetEvent monitorStop=new ManualResetEvent(false); Thread monitor=null; int endpointChanged=0;
            try
            {
                string deviceId=null;
                client=mode=="apple"?ProcessClient(pid):SystemClient(out deviceId);
                if(mode=="apple")
                {
                    WaveFormat pcm=new WaveFormat(); pcm.Tag=1; pcm.Channels=2; pcm.Rate=44100; pcm.Bits=16; pcm.Align=4; pcm.BytesPerSecond=176400;
                    formatPtr=Marshal.AllocCoTaskMem(Marshal.SizeOf(typeof(WaveFormat)));
                    Marshal.StructureToPtr(pcm,formatPtr,false);
                }
                else Check(client.GetMixFormat(out formatPtr));
                WaveFormat format=(WaveFormat)Marshal.PtrToStructure(formatPtr,typeof(WaveFormat));
                bool floating=format.Tag==3 || (format.Tag==65534 && Marshal.ReadInt32(formatPtr,24)==3);
                if(format.Channels==0 || format.Align==0 || format.Rate<8000 || !(floating&&format.Bits==32 || !floating&&(format.Bits==16 || format.Bits==24 || format.Bits==32))) throw new NotSupportedException("Unsupported device audio format");
                uint flags=0x00020000|0x00040000;
                if(mode=="apple") flags|=0x80000000; // shared-mode PCM conversion
                Check(client.Initialize(0,flags,0,0,formatPtr,IntPtr.Zero));
                Guid captureId=CaptureId; object service;
                Check(client.GetService(ref captureId,out service)); capture=(IAudioCaptureClient)service;
                Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()));
                Check(client.Start()); started=true;
                Spectrum fft=new Spectrum((int)format.Rate);
                byte[] bytes=new byte[Math.Max(65536,(int)format.Rate*format.Align/5)];
                Stopwatch output=Stopwatch.StartNew(),lastPacket=Stopwatch.StartNew();
                Status("capturing",mode,mode=="apple"?"Apple Music process loopback":"Default output device loopback",pid,(int)format.Rate);
                // Session enumeration can take hundreds of milliseconds. Keep it
                // off the thread that drains audio packets and publishes FFTs.
                monitor=new Thread(delegate() {
                    int monitorInit=CoInitializeEx(IntPtr.Zero,0);
                    try {
                        while(!monitorStop.WaitOne(1000)) {
                            if(mode=="apple"?ApplePid()!=pid:DefaultDeviceId()!=deviceId) {
                                Interlocked.Exchange(ref endpointChanged,1); break;
                            }
                        }
                    }
                    catch { Interlocked.Exchange(ref endpointChanged,1); }
                    finally { if(monitorInit>=0) CoUninitialize(); }
                });
                monitor.IsBackground=true; monitor.SetApartmentState(ApartmentState.MTA); monitor.Start();
                while(seconds<=0 || lifetime.Elapsed.TotalSeconds<seconds)
                {
                    if(Interlocked.CompareExchange(ref endpointChanged,0,0)!=0) return;
                    ready.WaitOne(10);
                    uint packet; Check(capture.GetNextPacketSize(out packet));
                    while(packet>0)
                    {
                        IntPtr buffer; uint frames,bufferFlags; ulong pos,qpc;
                        Check(capture.GetBuffer(out buffer,out frames,out bufferFlags,out pos,out qpc));
                        try
                        {
                            int length=checked((int)frames*format.Align);
                            bool silent=(bufferFlags&2)!=0 || buffer==IntPtr.Zero;
                            if(bytes.Length<length) bytes=new byte[length];
                            if(!silent) Marshal.Copy(buffer,bytes,0,length);
                            fft.AddPacket(bytes,(int)frames,format.Channels,format.Align,format.Bits,floating,silent);
                            lastPacket.Restart();
                        }
                        finally { Check(capture.ReleaseBuffer(frames)); }
                        Check(capture.GetNextPacketSize(out packet));
                    }
                    if(output.ElapsedMilliseconds>=16)
                    {
                        // Drivers can stop sending packets during silence; don't retain the last spectrum.
                        if(lastPacket.ElapsedMilliseconds>50) fft.Clear();
                        Console.WriteLine(fft.Json()); Console.Out.Flush(); output.Restart();
                    }
                }
            }
            finally
            {
                monitorStop.Set(); if(monitor!=null&&monitor.IsAlive) monitor.Join(); monitorStop.Dispose();
                if(started) { try { client.Stop(); } catch {} }
                if(capture!=null) Marshal.ReleaseComObject(capture);
                if(client!=null) Marshal.ReleaseComObject(client);
                if(formatPtr!=IntPtr.Zero) Marshal.FreeCoTaskMem(formatPtr);
                ready.Dispose();
            }
        }
    }
    public sealed class Spectrum
    {
        const int N=2048, Count=44;
        readonly int rate; readonly double[] ring=new double[N], re=new double[N], im=new double[N], smooth=new double[Count]; int index;
        public Spectrum(int sampleRate) { rate=sampleRate; }
        public void Clear() { Array.Clear(ring,0,N); }
        public void AddSample(double value) { ring[index]=double.IsNaN(value)||double.IsInfinity(value)?0:Math.Max(-1,Math.Min(1,value)); index=(index+1)%N; }
        public void AddPacket(byte[] bytes,int frames,int channels,int align,int bits,bool floating,bool silent)
        {
            int step=bits/8;
            for(int f=0;f<frames;f++)
            {
                double sum=0;
                if(!silent) for(int c=0;c<channels;c++)
                {
                    int offset=f*align+c*step; double value;
                    if(floating) value=BitConverter.ToSingle(bytes,offset);
                    else if(bits==16) value=BitConverter.ToInt16(bytes,offset)/32768.0;
                    else if(bits==24) { int raw=bytes[offset]|bytes[offset+1]<<8|bytes[offset+2]<<16; if((raw&0x800000)!=0) raw|=unchecked((int)0xff000000); value=raw/8388608.0; }
                    else value=BitConverter.ToInt32(bytes,offset)/2147483648.0;
                    sum+=value;
                }
                AddSample(sum/channels);
            }
        }
        public double[] Levels(out double rms,out double peak)
        {
            double power=0; peak=0;
            for(int i=0;i<N;i++)
            {
                double value=ring[(index+i)%N]; power+=value*value; peak=Math.Max(peak,Math.Abs(value));
                re[i]=value*(.5-.5*Math.Cos(2*Math.PI*i/(N-1))); im[i]=0;
            }
            rms=Math.Sqrt(power/N);
            // Keep low speaker volume readable without inventing energy in silent bands.
            double normalization=Math.Max(1,Math.Min(40,.15/Math.Max(rms,0.000015)));
            for(int i=1,j=0;i<N;i++)
            {
                int bit=N>>1; for(; (j&bit)!=0; bit>>=1) j^=bit; j^=bit;
                if(i<j) { double a=re[i]; re[i]=re[j]; re[j]=a; }
            }
            for(int len=2;len<=N;len<<=1)
            {
                double angle=-2*Math.PI/len, wr0=Math.Cos(angle), wi0=Math.Sin(angle);
                for(int start=0;start<N;start+=len)
                {
                    double wr=1,wi=0;
                    for(int j=0;j<len/2;j++)
                    {
                        int a=start+j,b=a+len/2; double tr=re[b]*wr-im[b]*wi,ti=re[b]*wi+im[b]*wr;
                        re[b]=re[a]-tr; im[b]=im[a]-ti; re[a]+=tr; im[a]+=ti;
                        double next=wr*wr0-wi*wi0; wi=wr*wi0+wi*wr0; wr=next;
                    }
                }
            }
            double[] result=new double[Count]; double upper=Math.Min(16000,rate*.45);
            for(int b=0;b<Count;b++)
            {
                int low=Math.Max(1,(int)Math.Floor(45*Math.Pow(upper/45,(double)b/Count)*N/rate));
                int high=Math.Min(N/2-1,Math.Max(low+1,(int)Math.Ceiling(45*Math.Pow(upper/45,(double)(b+1)/Count)*N/rate)));
                double sum=0; for(int bin=low;bin<high;bin++) sum+=re[bin]*re[bin]+im[bin]*im[bin];
                double amplitude=Math.Sqrt(sum/Math.Max(1,high-low))*4/N*normalization;
                double target=Math.Max(0,Math.Min(1,(20*Math.Log10(amplitude+1e-10)+72)/66));
                // The dB scale alone lifts quiet bands close to loud ones. Expand
                // their visual separation without adding any artificial motion.
                target=Math.Pow(target,2.2);
                if(rms<0.000015) target=0;
                smooth[b]+=(target-smooth[b])*(target>smooth[b]?1:.55);
                if(smooth[b]<.001) smooth[b]=0;
                result[b]=smooth[b];
            }
            return result;
        }
        public string Json()
        {
            double rms,peak; double[] bands=Levels(out rms,out peak); StringBuilder sb=new StringBuilder("{\"type\":\"spectrum\",\"bands\":[");
            for(int i=0;i<bands.Length;i++) { if(i>0) sb.Append(','); sb.Append(bands[i].ToString("0.000",CultureInfo.InvariantCulture)); }
            long generatedAt=(DateTime.UtcNow.Ticks-621355968000000000L)/10000;
            sb.Append("],\"rms\":").Append(rms.ToString("0.000000",CultureInfo.InvariantCulture)).Append(",\"peak\":").Append(peak.ToString("0.000000",CultureInfo.InvariantCulture)).Append(",\"generatedAt\":").Append(generatedAt).Append('}');
            return sb.ToString();
        }
    }
    [StructLayout(LayoutKind.Sequential,Pack=2)] struct WaveFormat { public ushort Tag,Channels; public uint Rate,BytesPerSecond; public ushort Align,Bits,Extra; }
    [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
    [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator
    {
        [PreserveSig]int EnumAudioEndpoints(int flow,uint mask,out IntPtr devices);
        [PreserveSig]int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);
        [PreserveSig]int GetDevice([MarshalAs(UnmanagedType.LPWStr)]string id,out IMMDevice device);
        [PreserveSig]int RegisterEndpointNotificationCallback(IntPtr callback);
        [PreserveSig]int UnregisterEndpointNotificationCallback(IntPtr callback);
    }
    [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice
    {
        [PreserveSig]int Activate(ref Guid iid,uint context,IntPtr activation,[MarshalAs(UnmanagedType.IUnknown)]out object value);
        [PreserveSig]int OpenPropertyStore(int access,out IntPtr properties);
        [PreserveSig]int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id);
        [PreserveSig]int GetState(out uint state);
    }
    [ComImport,Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioClient
    {
        [PreserveSig]int Initialize(int mode,uint flags,long duration,long periodicity,IntPtr format,IntPtr session);
        [PreserveSig]int GetBufferSize(out uint size);
        [PreserveSig]int GetStreamLatency(out long latency);
        [PreserveSig]int GetCurrentPadding(out uint padding);
        [PreserveSig]int IsFormatSupported(int mode,IntPtr format,out IntPtr closest);
        [PreserveSig]int GetMixFormat(out IntPtr format);
        [PreserveSig]int GetDevicePeriod(out long standard,out long minimum);
        [PreserveSig]int Start(); [PreserveSig]int Stop(); [PreserveSig]int Reset();
        [PreserveSig]int SetEventHandle(IntPtr handle);
        [PreserveSig]int GetService(ref Guid iid,[MarshalAs(UnmanagedType.IUnknown)]out object service);
    }
    [ComImport,Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioCaptureClient
    {
        [PreserveSig]int GetBuffer(out IntPtr data,out uint frames,out uint flags,out ulong position,out ulong qpc);
        [PreserveSig]int ReleaseBuffer(uint frames);
        [PreserveSig]int GetNextPacketSize(out uint frames);
    }
    [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionManager2
    {
        [PreserveSig]int GetAudioSessionControl(IntPtr session,uint flags,out IntPtr control);
        [PreserveSig]int GetSimpleAudioVolume(IntPtr session,uint flags,out IntPtr volume);
        [PreserveSig]int GetSessionEnumerator(out IAudioSessionEnumerator enumerator);
    }
    [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionEnumerator
    { [PreserveSig]int GetCount(out int count); [PreserveSig]int GetSession(int index,[MarshalAs(UnmanagedType.IUnknown)]out object session); }
    [ComImport,Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionControl2
    {
        [PreserveSig]int GetState(out int state);
        [PreserveSig]int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)]out string name);
        [PreserveSig]int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)]string name,IntPtr context);
        [PreserveSig]int GetIconPath([MarshalAs(UnmanagedType.LPWStr)]out string name);
        [PreserveSig]int SetIconPath([MarshalAs(UnmanagedType.LPWStr)]string name,IntPtr context);
        [PreserveSig]int GetGroupingParam(out Guid group);
        [PreserveSig]int SetGroupingParam(ref Guid group,IntPtr context);
        [PreserveSig]int RegisterAudioSessionNotification(IntPtr callback);
        [PreserveSig]int UnregisterAudioSessionNotification(IntPtr callback);
        [PreserveSig]int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
        [PreserveSig]int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)]out string id);
        [PreserveSig]int GetProcessId(out uint pid);
        [PreserveSig]int IsSystemSoundsSession();
        [PreserveSig]int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)]bool optOut);
    }
    [ComImport,Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioMeterInformation
    { [PreserveSig]int GetPeakValue(out float peak); }
    [ComImport,Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IActivateOperation
    { [PreserveSig]int GetActivateResult(out int result,[MarshalAs(UnmanagedType.IUnknown)]out object activated); }
    [ComVisible(true),Guid("41D949AB-9862-444A-80F6-C261334DA5EB"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IActivateCallback
    { [PreserveSig]int ActivateCompleted(IActivateOperation operation); }
    [ComVisible(true),Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IAgileObject {}
    [ComVisible(true),ClassInterface(ClassInterfaceType.None)] public sealed class Activation : IActivateCallback,IAgileObject
    {
        public readonly ManualResetEvent Completed=new ManualResetEvent(false); public int Result; public object Client;
        public int ActivateCompleted(IActivateOperation operation)
        {
            try { int hr=operation.GetActivateResult(out Result,out Client); if(hr<0) Result=hr; }
            catch(Exception e) { Result=Marshal.GetHRForException(e); }
            finally { Completed.Set(); }
            return 0;
        }
    }
}
