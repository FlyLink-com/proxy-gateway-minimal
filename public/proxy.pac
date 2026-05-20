// proxy.pac - PAC file for traffic routing (DNS leak protection)
// CN traffic: direct | Foreign traffic: via HTTP proxy
// Strategy: CN domain suffix + CN service whitelist → DIRECT, everything else → PROXY
// No dnsResolve() calls — prevents DNS queries from leaking through local ISP

function FindProxyForURL(url, host) {
    // 1. Non-http(s) traffic - direct
    if (!shExpMatch(url, "http://*") && !shExpMatch(url, "https://*")) {
        return "DIRECT";
    }

    // 2. Localhost and local network - always direct
    if (isPlainHostName(host) ||
        shExpMatch(host, "localhost") ||
        shExpMatch(host, "127.*") ||
        shExpMatch(host, "10.*") ||
        shExpMatch(host, "172.16.*") ||
        shExpMatch(host, "172.17.*") ||
        shExpMatch(host, "172.18.*") ||
        shExpMatch(host, "172.19.*") ||
        shExpMatch(host, "172.2*") ||
        shExpMatch(host, "172.3*") ||
        shExpMatch(host, "192.168.*") ||
        shExpMatch(host, "*.local")) {
        return "DIRECT";
    }

    // 3. CN domain suffixes - always direct
    var cnSuffixes = [
        ".cn", ".com.cn", ".net.cn", ".org.cn", ".gov.cn", ".edu.cn",
        ".ac.cn", ".mil.cn", ".co.cn",
        ".bj.cn", ".sh.cn", ".tj.cn", ".cq.cn", ".he.cn", ".sx.cn",
        ".nm.cn", ".ln.cn", ".jl.cn", ".hl.cn", ".js.cn", ".zj.cn",
        ".ah.cn", ".fj.cn", ".jx.cn", ".sd.cn", ".ha.cn", ".hb.cn",
        ".hn.cn", ".gd.cn", ".gx.cn", ".hi.cn", ".sc.cn", ".gz.cn",
        ".yn.cn", ".xz.cn", ".sn.cn", ".gs.cn", ".qh.cn", ".nx.cn",
        ".xj.cn", ".tw.cn", ".hk.cn", ".mo.cn"
    ];
    for (var i = 0; i < cnSuffixes.length; i++) {
        if (dnsDomainIs(host, cnSuffixes[i])) return "DIRECT";
    }

    // 4. Common CN service domains - always direct
    var cnDomains = [
        "baidu.com", "bdstatic.com", "taobao.com", "tmall.com", "alicdn.com",
        "alibaba.com", "alipay.com", "aliyun.com", "jd.com", "jdcloud.com",
        "360buyimg.com", "qq.com", "weixin.qq.com", "wechat.com", "gtimg.cn",
        "qpic.cn", "qcloud.com", "163.com", "126.com", "netease.com",
        "weibo.com", "weibocdn.com", "zhihu.com", "zhimg.com", "bilibili.com",
        "biliapi.net", "hdslb.com", "douyin.com", "toutiao.com", "bytedance.com",
        "meituan.com", "dianping.com", "pinduoduo.com", "xiaomi.com", "mi.com",
        "douyu.com", "huya.com", "csdn.net", "cnblogs.com", "juejin.cn",
        "chinaunicom.com", "chinatelecom.com", "10086.cn",
        "12306.cn", "icbc.com.cn", "ccb.com", "boc.cn", "abchina.com",
        "bankcomm.com", "globalcirclecat.com", "pstatp.com"
    ];
    for (var j = 0; j < cnDomains.length; j++) {
        if (dnsDomainIs(host, cnDomains[j])) return "DIRECT";
    }

    // 5. Default: route through HTTP proxy
    // Unknown domains go to proxy without DNS resolution to prevent DNS leaks
    return "PROXY 127.0.0.1:18180";
}
