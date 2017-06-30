#include<iostream>
#include<math.h>
using namespace std;
int main()
{
int n,i,p,x,y;
cin>>n;
double d,sq1,sq2,sq,root,slope,slope1;
for(i=0;i<n;i++)
{
    cin>>p;
    cin>>x>>y;
    sq1=(x-50)*(x-50);
    sq2=(y-50)*(y-50);
    sq=sq1+sq2;
    root=pow(sq,0.5);
    if(root>50)
    {
    cout<<"case #"<<(i+1)<<": white\n";
    }
    else{
    slope=tan((y-50)/(x-50));
    slope1=tan(p*3.6*3.142/180);
    if(slope>=90&&slope<=180)
    slope=slope-90;
    if(slope1>=90&&slope1<=180)
    slope1=slope1-90;
    if(slope>=180&&slope<=270)
    slope=slope-180;
    if(slope1>=180&&slope1<=270)
    slope1=slope1-180;
    if(slope>=270&&slope<=360)
    slope=slope-270;
    if(slope1>=270&&slope1<=360)
    slope1=slope1-270;
    if(slope1>slope)
    {
    cout<<"case #"<<(i+1)<<": black\n";
    }
    else{
    cout<<"case #"<<(i+1)<<": white\n";
    }
    }
}
return 0;
}
